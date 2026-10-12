# Hyperpedia

Hyperpedia is een rustige Nederlandstalige encyclopedie met forumverhalen over hyperventilatie, vreemde lichamelijke sensaties, hyperarousal, stress en zenuwstelselontregeling.

## Lokaal starten

```bash
npm install
SESSION_SECRET="$(openssl rand -base64 48)" DATA_DIR=./data npm run create-admin -- beheerder "kies-een-lang-wachtwoord"
SESSION_SECRET="$(openssl rand -base64 48)" DATA_DIR=./data npm start
```

Open daarna `http://localhost:8080` en ga naar `/login`.

## Veilige login instellen

1. Kies één beheerderaccount; alleen ingelogde beheerders kunnen verhalen toevoegen of bewerken.
2. Gebruik een uniek wachtwoord van minimaal 16 tekens, bij voorkeur uit een wachtwoordmanager.
3. Het wachtwoord wordt nooit plaintext opgeslagen: `scripts/create-admin.js` hasht het met PBKDF2-SHA256 met 310.000 iteraties voordat het in de data-mount komt.
4. Bewaar `SESSION_SECRET` als Fly secret voor stabiele ondertekening van cookies. Als deze secret ontbreekt start de app met een tijdelijke secret zodat Fly-healthchecks niet falen. Sessies staan in het servergeheugen en eindigen bij iedere restart of deploy; daarna log je opnieuw in.
5. Zet secrets op Fly:

```bash
fly secrets set SESSION_SECRET="$(openssl rand -base64 48)"
```

6. Maak na de eerste deploy een admin aan in de machine met de gemounte database. Gebruik hiervoor `fly ssh console`, niet je lokale `DATA_DIR=./data`, want Fly leest de admin uit `/data/hyperpedia-admin.json` op het volume:

```bash
fly ssh console -a hyper -C 'cd /app && node scripts/create-admin.js beheerder "een-heel-lang-uniek-wachtwoord"'
```

### Login op productie herstellen

Als je lokaal `DATA_DIR=./data npm run create-admin -- ...` hebt gedraaid en daarna deployt, staat de admin alleen op je Mac in `./data/hyperpedia-admin.json`. Die lokale map wordt niet naar het Fly-volume gekopieerd. Herstel productie zo:

```bash
fly secrets set -a hyper SESSION_SECRET="$(openssl rand -base64 48)"
fly deploy -a hyper
fly ssh console -a hyper -C 'cd /app && node scripts/create-admin.js beheerder "een-heel-lang-uniek-wachtwoord"'
```

Het adminwachtwoord staat los van `SESSION_SECRET` in `/data/hyperpedia-admin.json`. Houd de secret stabiel, maar houd er rekening mee dat sessies ook bij een serverrestart eindigen omdat ze in het geheugen staan.

## Deploy naar Fly.io

Maak eerst het volume in dezelfde regio als `fly.toml`:

```bash
fly volumes create hyper_data --region ams --size 1 -a hyper
fly deploy
```

De posts worden opgeslagen in `/data/hyperpedia-posts.json`, dus ze blijven behouden tussen deploys zolang het volume bestaat.

## Canonieke productie-URL

`fly.toml` zet `SITE_URL` vast op `https://hyperpedia.app`. De server gebruikt die waarde voor canonieke links, Open Graph, `robots.txt`, de sitemap en een permanente redirect van alternatieve hosts zoals `www.hyperpedia.app`. Laat Cloudflare daarnaast HTTP naar HTTPS omleiden; HTTP-URL's horen in Google Search Console als omleidingen te worden gerapporteerd en worden zelf niet geïndexeerd.

## Fly luisteradres

Fly verwacht dat de Node-server op `0.0.0.0:8080` luistert. De startcode in `src/server.js` gebruikt daarom `process.env.PORT || 8080` en bindt aan `process.env.HOST || '0.0.0.0'`, zodat de Fly Proxy de app kan bereiken.

## Zoekmachines en deelvoorbeelden

- Elke verhaalpagina heeft een eigen titel, omschrijving, canonieke URL, Open Graph- en X/Twitter-kaart. Het gedeelde PNG-beeld is 1200 × 630 pixels; `public/social-preview.svg` blijft het bewerkbare bronbestand.
- `/sitemap.xml` wordt uit de actuele opslag opgebouwd: alle verhalen, themapagina's en hun paginering. Bij meer dan 5.000 URL's wordt het automatisch een sitemapindex met deelbestanden onder `/sitemaps/`. Alleen echte, geldige wijzigingsdatums worden vermeld; leesstatistieken veranderen die datums niet.
- Zoekresultaten, lege themapagina's, beheer en login worden niet geïndexeerd. `robots.txt` laat crawlers deze instructies lezen en verwijst naar de sitemap. Ongeldige paginanummers worden naar de bestaande archiefpagina omgeleid; ontbrekende verhalen geven HTTP 404.
- De manifest-, Apple-, PNG-, SVG- en ICO-iconen gebruiken hetzelfde Hyperpedia-beeldmerk. Licht/donker volgt eerst het systeem, daarna de opgeslagen keuze. Er is geen offline cache van verhalen of beheerpagina's.

### Na deployment in Google Search Console

1. Verifieer de domeinproperty `hyperpedia.app` via het DNS-record dat Google verstrekt (of gebruik je bestaande property).
2. Dien `https://hyperpedia.app/sitemap.xml` in bij **Sitemaps**. Deelbestanden hoeven niet afzonderlijk ingediend te worden.
3. Controleer de homepage, een verhaal en een themapagina met **URL-inspectie → Live URL testen**. Controleer ook de gestructureerde gegevens met de Rich Results Test.
4. Laat HTTP-, www- en Fly-hostvarianten naar de ingestelde `SITE_URL` verwijzen. Een vermelding als omleiding voor zo'n alternatief is normaal; controleer de uiteindelijke HTTPS-URL.
5. Zorg dat Cloudflare geen challenge/blokkade oplegt aan Googlebot of sociale previewcrawlers. Cache beheer, login en POST-verzoeken niet. Houd sitemap- en HTML-caching kort of respecteer de originheaders.

Google bepaalt zelf wanneer pagina's worden gecrawld en geïndexeerd. Een geldige sitemap of structured data garandeert geen indexering of rich result. Platforms kunnen oude deelvoorbeelden tijdelijk blijven cachen.

## Validatie en opslag

`npm test` controleert de routes, beheerhandelingen, sessies, SEO, sitemapopdeling en archiefopslag. Formulieren zijn begrensd op 1 MiB en vereiste inhoud wordt op de server gecontroleerd. Logout trekt de serversessie in en sessies verlopen na zeven dagen. Maak regelmatig een back-up van het Fly-volume: atomaire JSON-writes zijn geen back-up. De JSON-opslag is bedoeld voor één schrijvend Node-proces op één volume; meerdere replicas vereisen een gedeelde database.

Onleesbare of corrupte archiefbestanden veroorzaken nu een fout in plaats van een leeg archief dat later overschreven kan worden. Herstel zo'n bestand vanuit een back-up voordat je verder bewerkt.

## Versies en onderhoud

`package.json` is de bron voor de appversie. De footer, opstartmelding, HTTP-header `X-Hyperpedia-Version`, exportbestandsnaam en CSS/JS-cacheversies gebruiken dezelfde waarde. Wijzig toekomstige versies met `npm version patch --no-git-tag-version` (of `minor`), werk `CHANGELOG.md` bij en voer `npm test` uit voordat je de wijziging publiceert. Node 22 of nieuwer is vereist; de Docker-image gebruikt Node 24.

De openbare navigatie toont geen beheerkoppeling. Open `/login` om te beheren. Via **Archief exporteren** op `/admin` download je een JSON-kopie van alle verhalen en reacties, met schema- en appversie. De export bevat geen wachtwoordgegevens of sessies en vervangt geen volledige back-up van het volume.

Het archief gebruikt zes verhalen per zichtbare kaartkolom: 6, 12, 18, 24, 30 of 36 per pagina. Browserpaginering en resizing bewaren de selectie en houden de huidige tekst beschikbaar als een verzoek mislukt. De server behoudt standaard 18 verhalen per pagina voor vaste, crawlbare archief- en sitemap-URL's; persoonlijke `perPage`-varianten zijn `noindex, follow`. Zonder JavaScript blijven de serverpagina's bereikbaar.

Zoeken negeert hoofdletters en accenten en zoekt alle ingevoerde woorden, ook in reacties. Verhaallinks bewaren de oorspronkelijke zoekopdracht, het thema en de pagina voor de terugknop. Tekstgrootte en leesbreedte worden alleen in de huidige browser bewaard. Delen en kopiëren gebruiken de schone canonieke verhaallink; afdrukken gebruikt een rustige, lichte opmaak.

Bewerkformulieren bevatten een revisiecontrole: als een ander tabblad het verhaal intussen heeft veranderd, blijft jouw invoer beschikbaar en vraagt de pagina je de laatste versie te openen. HTTP-formulierclients die geen revisie meesturen behouden hun bestaande gedrag. De opslag valideert records vóór schrijven, houdt geïsoleerde caches bij en detecteert vervanging van JSON-bestanden op schijf.

### Browsercontroles

De ontwikkeldependency Playwright draait afzonderlijke regressiecontroles voor paginering, resizing, terugnavigatie, delen/kopiëren, afdrukken, voorkeuren, het informatiedialoogvenster en mislukte netwerkverzoeken. De fixturegegevens staan in een tijdelijke map en gebruiken je echte archief niet.

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

De Node 24-job in GitHub Actions voert deze browsercontroles ook uit. Een bestaande Chromium-installatie kan worden gekozen met `BROWSER_EXECUTABLE=/pad/naar/chromium npm run test:browser`. Docker installeert uitsluitend productieafhankelijkheden en neemt Playwright niet mee.
