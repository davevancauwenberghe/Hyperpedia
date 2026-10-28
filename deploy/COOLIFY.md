# Move Hyperpedia from Fly.io to Coolify

This deployment fits the existing VPS setup: **Apache owns ports 80/443** and
Coolify's server proxy stays **Custom / None**. Apache forwards to Hyperpedia on
`127.0.0.1:18081`; the application listens on port 8080 inside its container.

| Old location | New location |
| --- | --- |
| Fly app `hyper-2ediba` | Coolify application from this repository |
| Fly volume `hyper_data`, mounted at `/data` | VPS directory `/srv/hyperpedia/data`, mounted at `/data` |
| Fly-managed origin certificate | Cloudflare Origin CA certificate installed in Apache |

Use the migration release on `main` after merging its PR, or select
`deploy/coolify-0.6.3` while testing the unmerged change. Keep one application
container; the JSON store does not support several writers or overlapping
rolling deployments.

## 1. Copy the complete Fly volume to your Mac

The volume contains the stories, replies, password hash, read counters and curated
routes. The admin dashboard's JSON export alone is not a complete volume backup.
Keep archive editing and Fly deployments paused from the export until cutover.

Run `fly status -a hyper-2ediba` first. The following commands pin the Machine ID
from the current deployment, `8e2440f771dd58`; update it if that Machine was replaced.

Run this block on your **Mac**. It makes a new private backup directory each time:

```bash
bash <<'BASH'
set -euo pipefail
umask 077
migration_dir="$HOME/Hyperpedia-migration-$(date -u +%Y%m%dT%H%M%SZ)"
mkdir "$migration_dir"
cd "$migration_dir"
fly ssh console -a hyper-2ediba --machine 8e2440f771dd58 -C "sh -eu -c 'umask 077; tar -C /data -czf /tmp/hyperpedia-data.tar.gz .'"
fly ssh sftp get -a hyper-2ediba --machine 8e2440f771dd58 /tmp/hyperpedia-data.tar.gz ./hyperpedia-data.tar.gz
chmod 600 hyperpedia-data.tar.gz
tar -tzf hyperpedia-data.tar.gz
shasum -a 256 hyperpedia-data.tar.gz > hyperpedia-data.tar.gz.sha256
printf '\nBackup directory: %s\n' "$migration_dir"
BASH
```

If an export reports that files changed while being read, repeat it while the
archive is idle. An errored export is not a completed backup. The commands above
stop on errors. Keep the archive private: it includes the administrator hash.

The listing should include `hyperpedia-posts.json` and `hyperpedia-admin.json`
(older installations may use `hyper-posts.json` and `hyper-admin.json`). Optional
files include `hyperpedia-read-metrics.json` and `hyperpedia-reading-paths.json`.
All files in `/data` are copied, including any legacy filenames.

From the backup directory printed above, copy the archive and checksum over SSH:

```bash
scp hyperpedia-data.tar.gz hyperpedia-data.tar.gz.sha256 dave@YOUR_VPS_IP:
```

## 2. Restore to the VPS before deploying

SSH into the VPS using your normal account. This block verifies the transfer,
restores into a private staging directory and refuses to replace an existing
`/srv/hyperpedia/data`. It uses Ubuntu's `tar`, `sha256sum` and `mv`.

```bash
bash <<'BASH'
set -euo pipefail
cd "$HOME"
sha256sum -c hyperpedia-data.tar.gz.sha256
sudo install -d -m 0700 /srv/hyperpedia
if sudo test -e /srv/hyperpedia/data; then
  printf '%s\n' '/srv/hyperpedia/data already exists; inspect it before restoring.' >&2
  exit 1
fi
migration_stage="$(sudo mktemp -d /srv/hyperpedia/restore.XXXXXXXX)"
sudo tar --no-same-owner -xzf "$HOME/hyperpedia-data.tar.gz" -C "$migration_stage"
sudo chown -R 1000:1000 "$migration_stage"
sudo chmod -R u+rwX,go-rwx "$migration_stage"
sudo mv -T --no-clobber "$migration_stage" /srv/hyperpedia/data
sudo test ! -e "$migration_stage"
sudo ls -la /srv/hyperpedia/data
BASH
```

The image runs as the Node user, UID/GID 1000. Matching ownership is needed because
the JSON files are private and atomic writes need a writable directory.

## 3. Create the Coolify application

In the existing VPS project/environment, add an application from the GitHub
repository `davevancauwenberghe/Hyperpedia`:

| Setting | Value |
| --- | --- |
| Build pack | Docker Compose |
| Branch | `main` after merge, or the migration branch above |
| Base directory | `/` |
| Compose file | `/compose.yaml` |
| Service | `hyperpedia` |
| Coolify-generated domains | Leave blank; Apache handles the public domain |
| Server proxy | Keep Custom / None |
| Application replicas | One; disable rolling/overlapping replacements |
| Health check | Image check of `http://127.0.0.1:8080/healthz` |

The Compose file already defines the loopback port and persistent bind mount.
Use that mount as the application's storage. Check that port 18081 is free first:

```bash
sudo ss -lntp 'sport = :18081'
```

Generate a new session secret on your Mac or VPS:

```bash
openssl rand -hex 32
```

Save it as **SESSION_SECRET** in Coolify's application environment, available at
runtime and for Compose interpolation. Keep it out of Git and chat. The Compose
file supplies `NODE_ENV`, `DATA_DIR`, `SITE_URL`, the privacy contact,
`REQUIRE_EXISTING_DATA=true` and `TRUST_APACHE_PROXY=true`.

Deploy. The application refuses to start with an empty archive, a missing/invalid
admin record or corrupt optional stores. It will not initialise replacement data.
Use the service's Coolify Terminal to run:

```bash
npm run check:data
```

This prints only story/reply/curated-route counts and admin-record availability.
Check the counts against the source archive. It does not modify files or print
password hashes. The original admin password still works; old login sessions end.

On the VPS, verify the local backend:

```bash
curl --fail http://127.0.0.1:18081/healthz
curl --fail -H 'Host: hyperpedia.app' -H 'X-Forwarded-Proto: https' http://127.0.0.1:18081/sitemap.xml
```

## 4. Install a certificate and Apache virtual host

In the **hyperpedia.app** Cloudflare zone, go to **SSL/TLS → Origin Server → Create
Certificate**. Choose RSA and include `hyperpedia.app` and `www.hyperpedia.app`
(or the apex and wildcard). Save the Origin Certificate and private key on the
VPS at these paths. The existing certificate for `*.davevancauwenberghe.be` does
not cover this separate domain.

```bash
sudo mkdir -p /etc/ssl/cloudflare
sudo touch /etc/ssl/cloudflare/hyperpedia.app.key
sudo chmod 600 /etc/ssl/cloudflare/hyperpedia.app.key
sudo nano /etc/ssl/cloudflare/hyperpedia.app.pem
sudo nano /etc/ssl/cloudflare/hyperpedia.app.key
```

Paste each complete PEM into its corresponding file; keep the private key on
the server. Then install this repository's `deploy/apache-hyperpedia.conf` as
`/etc/apache2/sites-available/hyperpedia.conf`. For a merged release:

```bash
bash <<'BASH'
set -euo pipefail
curl --fail --silent --show-error --output /tmp/apache-hyperpedia.conf https://raw.githubusercontent.com/davevancauwenberghe/Hyperpedia/main/deploy/apache-hyperpedia.conf
sudo install -m 0644 /tmp/apache-hyperpedia.conf /etc/apache2/sites-available/hyperpedia.conf
sudo a2enmod ssl headers proxy proxy_http
sudo a2ensite hyperpedia.conf
sudo apache2ctl configtest
sudo systemctl reload apache2
BASH
```

This adds a separate vhost and leaves the existing WordPress, Nextcloud and
Coolify management vhosts in place. Apache overwrites the dedicated client-IP
header; `TRUST_APACHE_PROXY` must only be enabled with that vhost and the private
backend port. Existing `mod_remoteip` handling for trusted Cloudflare addresses
continues to apply. Without it, login limits group clients by Cloudflare edge IP.

## 5. Point Cloudflare at the VPS

In the `hyperpedia.app` DNS zone, change the apex `A` record to the VPS's public
IPv4 address with proxying enabled (orange cloud). Replace any Fly `AAAA` record
with the VPS's working IPv6 address, or remove that old record if you are not
using IPv6 on this VPS. If `www` is used, point it to the apex. Keep mail and
unrelated DNS records intact. Keep SSL/TLS mode **Full (strict)**.

Once the new origin is being used, check:

```bash
curl --fail --head https://hyperpedia.app/
curl --fail https://hyperpedia.app/healthz
curl --fail https://hyperpedia.app/sitemap.xml
```

Open several real stories and replies, sign in at `/login` with the existing
password, verify admin totals, and redeploy once to confirm persistence. URLs,
canonical links and the browser's private reading list keep the same origin.

## 6. Retire Fly after verification

Keep the Fly volume and the local backup until the archive, admin login and a
Coolify redeployment are verified. Then stop the old Machine to avoid maintaining
two writable archives:

```bash
fly machine stop 8e2440f771dd58 -a hyper-2ediba
```

Leave `fly.toml` as a rollback reference until the migration is accepted. Returning
to Fly would require starting that Machine and fixing its certificate; do not
assume reverting DNS alone will repair the existing 525. Any edits made after
cutover would need copying back before a rollback. Stopped Fly volumes can still
incur charges; deleting the old app/volume is a separate action after the backup
and new deployment have been accepted.

Back up `/srv/hyperpedia/data` off the VPS as well. A bind mount survives container
replacement, but not VPS disk loss. Take backups while archive writes are idle.

References: [Coolify Compose](https://coolify.io/docs/applications/builds/docker-compose),
[persistent storage](https://coolify.io/docs/knowledge-base/persistent-storage),
[Fly SFTP](https://docs.fly.io/flyctl/cmd/fly_ssh_sftp_get),
[Cloudflare Origin CA](https://developers.cloudflare.com/ssl/origin-configuration/origin-ca/).
