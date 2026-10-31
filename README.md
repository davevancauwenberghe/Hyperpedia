# Hyperpedia

Een rustig Nederlandstalig leesarchief over hyperventilatie, overprikkeling, stress en lichamelijke sensaties.

## Coolify op de VPS

De Compose-configuratie draait Hyperpedia via Coolify achter een bestaande Apache-proxy.

- Repository: `davevancauwenberghe/Hyperpedia`; build pack **Docker Compose**, bestand `/compose.yaml`.
- Apache behoudt poorten 80/443. De applicatie publiceert alleen `127.0.0.1:18081` naar containerpoort 8080.
- De VPS-map `/srv/hyperpedia/data` wordt gekoppeld aan `/data`. Zet de bestaande bestanden en eigendom UID/GID 1000 klaar vóór de eerste deployment.
- Stel `SESSION_SECRET` in Coolify in op een willekeurige waarde van minstens 32 tekens. De Compose-configuratie bevat de productie-URL en privacygegevens.
- De productieconfiguratie gebruikt `REQUIRE_EXISTING_DATA=true`: een ontbrekend/leeg archief, ontbrekend beheerderbestand of corrupte optionele opslag voorkomt opstarten.
- `npm run check:data` controleert de gegevens zonder te schrijven en toont alleen aantallen. Behoud één schrijvend proces/container.
- De container draait als `node` (UID/GID 1000), heeft een geheugenlimiet van 512 MiB en krijgt vijftien seconden om netjes af te sluiten.

De Apache-vhost gebruikt `mod_remoteip` met uitsluitend Cloudflare's gepubliceerde proxy-adressen en stuurt HSTS op HTTPS. Installeer configuratiewijzigingen apart op de VPS en controleer ze met `apache2ctl configtest` vóór herladen. Houd de proxy-adressen actueel via de bronlinks in het configuratiebestand.

## Lokaal starten

```bash
npm ci
DATA_DIR=./data npm run create-admin -- beheerder
DATA_DIR=./data SESSION_SECRET='vervang-dit-door-een-willekeurige-waarde-van-minstens-32-tekens' npm start
```

Open `http://localhost:8080`. Beheer staat op `/login`. Voor een lege lokale ontwikkelomgeving staat `REQUIRE_EXISTING_DATA` standaard uit.

De beheerderopdracht vraagt tweemaal om een verborgen wachtwoord van minimaal zestien tekens. Geef wachtwoorden nooit als argument mee. Voor automatisering bestaat `--password-stdin`; lever invoer vanuit een secret manager of beschermd bestand, zonder het wachtwoord in een shellopdracht te typen.

## Gegevens en beheer

Verhalen en reacties staan in `hyperpedia-posts.json`, de beheerderhash in `hyperpedia-admin.json`, leestotalen in `hyperpedia-read-metrics.json` en handmatige leesroutes in `hyperpedia-reading-paths.json`. Oudere serverbestanden `hyper-posts.json` en `hyper-admin.json` blijven leesbaar. Kopieer bij een hostingmigratie de volledige `/data`-map; de beheerexport bevat niet alle account- en statistiekgegevens.

Nieuwe beheerwachtwoorden gebruiken PBKDF2-SHA256 met 600.000 iteraties. Oudere hashes blijven werken en worden bij een geslaagde login opgewaardeerd, met behoud van het wachtwoord. Serversessies staan in het geheugen en eindigen bij een herstart. Onleesbare of corrupte archiefbestanden worden niet stilzwijgend overschreven.

Elke archiefwijziging bewaart vijf eerdere versies in `hyperpedia-posts.json.bak` en `.bak.1` tot `.bak.4`, met private bestandsrechten. Dit helpt bij een verkeerde bewerking; maak daarnaast onafhankelijke back-ups buiten de VPS. Oude reacties zonder ID blijven leesbaar met hun bestaande ankers en krijgen geen onbruikbare bewerkknoppen.

Publieke verzoeken delen een onveranderlijke archiefsnapshot; sortering en zoekvelden worden per bestandsversie hergebruikt. Alleen beheerwijzigingen maken een bewerkbare kopie. Zoeken rangschikt titel- en thematreffers hoger dan treffers in de tekst en reacties. De eerste archiefpagina past haar zes rijen lokaal aan de schermbreedte aan.

Verhaaltellingen vereisen een expliciet signaal van toestemming vanaf dezelfde origin, worden begrensd en tellen een verhaal hoogstens eenmaal per kwartier per netwerkadres. Alleen totalen worden opgeslagen, elke dertig seconden en bij normaal afsluiten. Een abrupte processtop kan de laatste dertig seconden aan tellingen verliezen. Verhalen en beheeraanpassingen blijven direct atomair opgeslagen.

Loginuploads zijn begrensd op 8 KiB, één per clientadres en 16 tegelijk, met een absolute termijn van vijf seconden. De vier wachtwoordcontroles hebben een eigen limiet. `TRUST_APACHE_PROXY=true` is uitsluitend voor de meegeleverde vhost die `X-Hyperpedia-Client-IP` overschrijft, met een backendpoort die alleen lokaal bereikbaar is.

De app stuurt CSP en Permissions-Policy. Alleen eigen scripts en de exacte hashes van SEO-JSON-LD zijn toegestaan; inline handlers en externe scripts blijven geblokkeerd. `CSP_REPORT_ONLY=true` is beschikbaar voor een gecontroleerde proef. Versiegebonden statische bestanden gebruiken compressie, ETags en immutable caching; de serviceworker blijft hercontroleerbaar.

## Privacy en browseropslag

De cookiebanner gebruikt de sitenaam Hyperpedia. De privacycontactgegevens staan op `/privacy`. Duurzame leesvoorkeuren en anonieme verhaaltellingen staan standaard uit en kunnen afzonderlijk worden toegestaan of geweigerd. Beide keuzes gelden 365 dagen; intrekken stopt toekomstige optionele verwerking.

Zonder toestemming gelden leesvoorkeuren alleen voor de browsersessie. Bewaarde verhalen blijven uitsluitend in de huidige browser en het browserprofiel; ze worden niet naar de server gestuurd. Het behouden van `https://hyperpedia.app` houdt ook die browseropslag beschikbaar na de servermigratie.

## Versies en controles

`package.json` bevat de appversie voor footer, metadata en assets. Node 22 of nieuwer is vereist; de container gebruikt Node 24.

```bash
npm test
npm run lint
npm run format:check
npm run test:browser
npm run benchmark -- 3000
```

`npm run format` past de formatter toe. De benchmark maakt een tijdelijk synthetisch archief en opent geen productiegegevens. ESLint, Prettier en Playwright zijn alleen ontwikkelafhankelijkheden; de server heeft geen runtime-afhankelijkheden. De tijdelijke `minimatch`-override gebruikt de gerepareerde versie voor [GHSA-g3hv-75wg-m249](https://github.com/advisories/GHSA-g3hv-75wg-m249), totdat ESLint die zelf opneemt.

CI controleert Node 22/24, vier Chromium-browsercontroles, de echte Compose-image en Apache met tijdelijke certificaten. Daarbij worden de oorspronkelijke login, gegevensbehoud na herstart, CSP, responsieve paginering en veilige proxyheaders gecontroleerd. Dependabot volgt npm, Actions en Docker; Actions zijn op commit-SHA vastgezet.
