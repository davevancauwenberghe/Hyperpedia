# Hyperpedia

Een rustig Nederlandstalig leesarchief over hyperventilatie, overprikkeling, stress en lichamelijke sensaties.

## Coolify op de VPS

De Compose-configuratie draait Hyperpedia via Coolify achter een bestaande Apache-proxy.

- Repository: `davevancauwenberghe/Hyperpedia`; build pack **Docker Compose**, bestand `/compose.yaml`.
- Apache behoudt poorten 80/443. De applicatie publiceert alleen `127.0.0.1:18081` naar containerpoort 8080.
- De VPS-map `/srv/hyperpedia/data` wordt gekoppeld aan `/data`. Zet de bestaande bestanden en eigendom UID/GID 1000 klaar vóór de eerste deployment.
- Stel `SESSION_SECRET` in Coolify in op een willekeurige waarde van minstens 32 tekens. De Compose-configuratie bevat de productie-URL en privacygegevens.
- De migratiedeployment gebruikt `REQUIRE_EXISTING_DATA=true`: een ontbrekend/leeg archief, ontbrekend beheerderbestand of corrupte optionele opslag voorkomt opstarten.
- `npm run check:data` controleert de gekopieerde gegevens zonder te schrijven en toont alleen aantallen. Behoud één schrijvend proces/container.

`fly.toml` blijft voorlopig beschikbaar als verwijzing naar de bronapp `hyper-2ediba`; verwijder het oude volume pas na een gecontroleerde overdracht en back-up.

## Lokaal starten

```bash
npm ci
DATA_DIR=./data npm run create-admin -- beheerder 'een-uniek-wachtwoord-van-minstens-16-tekens'
DATA_DIR=./data SESSION_SECRET='vervang-dit-door-een-willekeurige-waarde-van-minstens-32-tekens' npm start
```

Open `http://localhost:8080`. Beheer staat op `/login`. Voor een lege lokale ontwikkelomgeving staat `REQUIRE_EXISTING_DATA` standaard uit.

## Gegevens en beheer

Verhalen en reacties staan in `hyperpedia-posts.json`, de beheerderhash in `hyperpedia-admin.json`, leestotalen in `hyperpedia-read-metrics.json` en handmatige leesroutes in `hyperpedia-reading-paths.json`. Oudere serverbestanden `hyper-posts.json` en `hyper-admin.json` blijven leesbaar. Kopieer bij een hostingmigratie de volledige `/data`-map; de beheerexport bevat niet alle account- en statistiekgegevens.

Het beheerwachtwoord wordt met PBKDF2-SHA256 en 310.000 iteraties gehasht. De migratie behoudt deze hash en daarmee het bestaande wachtwoord. Serversessies staan in het geheugen en eindigen bij een herstart. Onleesbare of corrupte archiefbestanden worden niet stilzwijgend overschreven. Maak onafhankelijke back-ups van de data.

Loginuploads zijn begrensd op 8 KiB, één per clientadres en 16 tegelijk, met een absolute termijn van vijf seconden. De vier wachtwoordcontroles hebben een eigen limiet. `TRUST_APACHE_PROXY=true` is uitsluitend voor de meegeleverde vhost die `X-Hyperpedia-Client-IP` overschrijft, met een backendpoort die alleen lokaal bereikbaar is.

## Privacy en browseropslag

De cookiebanner gebruikt de sitenaam Hyperpedia. De privacycontactgegevens staan op `/privacy`. Duurzame leesvoorkeuren en anonieme verhaaltellingen staan standaard uit en kunnen afzonderlijk worden toegestaan of geweigerd. Beide keuzes gelden 365 dagen; intrekken stopt toekomstige optionele verwerking.

Zonder toestemming gelden leesvoorkeuren alleen voor de browsersessie. Bewaarde verhalen blijven uitsluitend in de huidige browser en het browserprofiel; ze worden niet naar de server gestuurd. Het behouden van `https://hyperpedia.app` houdt ook die browseropslag beschikbaar na de servermigratie.

## Versies en controles

`package.json` bevat de appversie voor footer, metadata en assets. Node 22 of nieuwer is vereist; de container gebruikt Node 24.

```bash
npm test
npm run test:browser
```

Browsercontroles gebruiken Playwright Chromium. CI controleert daarnaast de echte Compose-image met een testarchief en verifieert dat de oorspronkelijke login en alle databestanden een containerherstart overleven.
