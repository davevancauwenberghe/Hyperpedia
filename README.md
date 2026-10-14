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

Inloguploads zijn afzonderlijk begrensd: maximaal 8 KiB per formulier, één actieve upload per clientadres en 16 tegelijk. Een upload moet binnen vijf seconden klaar zijn; geweigerde of verlopen uploads sluiten de verbinding. Deze limieten staan los van de vier gelijktijdige wachtwoordcontroles.

`package.json` is de bron voor de appversie. De footer, opstartmelding, HTTP-header `X-Hyperpedia-Version`, exportbestandsnaam en CSS/JS-cacheversies gebruiken dezelfde waarde. Wijzig toekomstige versies met `npm version patch --no-git-tag-version` (of `minor`), werk `CHANGELOG.md` bij en voer `npm test` uit voordat je de wijziging publiceert. Node 22 of nieuwer is vereist; de Docker-image gebruikt Node 24.

De openbare navigatie toont geen beheerkoppeling. Open `/login` om te beheren. Via **Archief exporteren** op `/admin` download je een JSON-kopie van alle verhalen en reacties, met schema- en appversie. De export bevat geen wachtwoordgegevens of sessies en vervangt geen volledige back-up van het volume.

Het archief gebruikt zes verhalen per zichtbare kaartkolom: 6, 12, 18, 24, 30 of 36 per pagina. Browserpaginering en resizing bewaren de selectie en houden de huidige tekst beschikbaar als een verzoek mislukt. De server behoudt standaard 18 verhalen per pagina voor vaste, crawlbare archief- en sitemap-URL's; persoonlijke `perPage`-varianten zijn `noindex, follow`. Zonder JavaScript blijven de serverpagina's bereikbaar.

Zoeken negeert hoofdletters en accenten en zoekt alle ingevoerde woorden, ook in reacties. Verhaallinks bewaren de oorspronkelijke zoekopdracht, het thema en de pagina voor de terugknop. Tekstgrootte en leesbreedte worden alleen in de huidige browser bewaard. Delen en kopiëren gebruiken de schone canonieke verhaallink; afdrukken gebruikt een rustige, lichte opmaak.

Bewerkformulieren bevatten een revisiecontrole: als een ander tabblad het verhaal intussen heeft veranderd, blijft jouw invoer beschikbaar en vraagt de pagina je de laatste versie te openen. HTTP-formulierclients die geen revisie meesturen behouden hun bestaande gedrag. De opslag valideert records vóór schrijven, houdt geïsoleerde caches bij en detecteert vervanging van JSON-bestanden op schijf.

### Leesvoorkeuren en leeslijst (v0.6.1)

Alle verhaalopties staan in **Leesvoorkeuren**: tekstgrootte, leesbreedte, Bewaren, Focus, Delen, Link kopiëren en Afdrukken. Het paneel begint gesloten en onthoudt expliciet openen of sluiten, ook bij refresh of een andere schermbreedte. Focus verbergt de omliggende navigatie en zijbalk; **Focus verlaten** of Escape brengt deze terug. De oorspronkelijke tekst en reacties blijven server-gerenderd en zonder JavaScript leesbaar. Verhaalpreviews bevatten alleen de leesknop.

**Bewaren** voegt een verhaal toe aan **Mijn leeslijst** (`/leeslijst`), uitsluitend in deze browser en dit browserprofiel. Een andere browser, profiel of apparaat heeft een eigen lijst; er is geen synchronisatie. De lijst ondersteunt maximaal 300 verhalen, bewaart ieder verhaal maximaal 365 dagen vanaf toevoegen en ondersteunt afzonderlijk verwijderen of de hele lijst wissen. Websitegegevens wissen of een privévenster sluiten kan de lijst verwijderen. Bij geblokkeerde opslag blijven wijzigingen alleen op de huidige pagina beschikbaar. Er is geen voortgangsregistratie, leesgeschiedenis, hervatten of automatische scrollherstelcode meer op verhaalpagina's. De positie van de zichtbare archiefkaart bij responsive paginering blijft wel behouden.

### Privacykeuze en browseropslag

De compacte banner en `/privacy` bieden even zichtbare knoppen om optionele functies toe te staan of te weigeren. Leesvoorkeuren over bezoeken heen en de verhaaltelling kunnen afzonderlijk worden gekozen. Beide staan standaard uit. Zonder toestemming werken voorkeuren alleen in `sessionStorage`; alleen na toestemming wordt de voorkeurenopslag in `localStorage` gelezen of geschreven. De verhaaltelling verstuurt pas na toestemming een verzoek, zonder cookies mee te sturen, en bewaart uitsluitend het totaal per verhaal. Leeslijstgegevens worden nooit naar de server gestuurd.

De privacykeuze (ook weigeren) vervalt na 365 dagen vanaf de keuze; bezoeken verlengen die termijn niet. De banner vraagt daarna opnieuw en leest geen oude optionele voorkeuren. Intrekken via **Privacy & opslag** in de footer verwijdert duurzame voorkeuren meteen en stopt toekomstige verhaaltellingen, ook in andere open tabbladen. Huidige sessievoorkeuren en expliciet bewaarde verhalen blijven bruikbaar. De beheerlogin gebruikt standaard een sessiecookie; alleen de expliciete keuze **7 dagen aangemeld blijven (gebruikt een cookie)** maakt de cookie persistent.

`fly.toml` configureert `PRIVACY_CONTROLLER` als Dave Van Cauwenberghe en `PRIVACY_CONTACT_URL` als `https://www.davevancauwenberghe.be/contact/`. Deze openbare contactgegevens verschijnen na deployment op `/privacy`. De cookiebanner gebruikt de sitenaam Hyperpedia. Voor lokale ontwikkeling kun je dezelfde omgevingsvariabelen gebruiken of ze voor een andere beheerder wijzigen. Controleer daarnaast de privacyinformatie voor het bestaande archief, je grondslag, hostinglogs en eventuele proxy-injecties; de toestemmingstechniek alleen is geen volledige AVG-beoordeling. De applicatie laadt alle scripts, lettertypen en afbeeldingen van dezelfde oorsprong en heeft geen advertenties of externe analysetools. De privacypagina toont eerst korte uitleg en keuzes binnen dezelfde responsive paginabreedte als het archief; de technische tabel met opslagrecords, doeleinden en termijnen staat onder **Meer over opslag en techniek**.

De keuzes volgen de [GBA-informatie over cookies en andere opslagtechnieken](https://www.gegevensbeschermingsautoriteit.be/burger/thema-s/internet/cookies), de [GBA-cookiechecklist](https://gegevensbeschermingsautoriteit.be/publications/cookie-checklist.pdf) en [Opinie 04/2012, sectie 3.6 over UI-voorkeuren](https://ec.europa.eu/justice/article-29/documentation/opinion-recommendation/files/2012/wp194_en.pdf). Een jaar is de hier gekozen geldigheidsduur, geen universele wettelijke GDPR-termijn.

### Leesroutes en bronvermelding

`/leesroutes` biedt korte routes door bestaande thema's. Zonder handmatige selectie worden maximaal zes themaroutes getoond voor thema's met minstens drie verhalen. Via `/admin/leesroutes` kun je drie tot vijf verhalen kiezen en ordenen of een eigen route toevoegen. De handmatige keuzes staan in `/data/hyperpedia-reading-paths.json` en zijn opgenomen als `readingPaths` in de archiefexport. Neem dit bestand ook mee in volumeback-ups. Als alleen dit selectiebestand onleesbaar is, blijft de export van verhalen en reacties beschikbaar; de export bevat dan `readingPaths: null` en een waarschuwing in `warnings`. Bewaar of herstel het originele selectiebestand apart. Verwijderde verhalen verdwijnen uit de publieke selectie; een onleesbaar selectiebestand wordt niet overschreven en publieke routes vallen terug op de thema's.

Bronvermeldingspagina's (`/bronvermelding/...`) geven `author.url` een werkende bestemming voor verhalen en reacties. Ze tonen de naam bij één archiefbijdrage en zijn geen accounts of geverifieerde biografieën. Dezelfde naam op verschillende bijdragen wordt niet automatisch als dezelfde persoon behandeld. Deze contextpagina's zijn `noindex, follow`; openbare leesroutes worden wel in de sitemap opgenomen. De algemene social preview blijft in Open Graph/Twitter-metadata en wordt niet als inhoudelijke verhaalafbeelding opgegeven.

### Sociale previews, zoekmachines en AI

Verhalen behouden hun eigen titel, omschrijving en schone canonieke URL in Open Graph en Twitter Cards, met de bestaande 1200×630 PNG-preview. De afbeeldings-URL bevat de appversie zodat bijgewerkte previews opnieuw kunnen worden opgehaald; HTTPS-pagina's bieden ook `og:image:secure_url`. Openbare, indexeerbare pagina's staan grote afbeeldingspreviews toe. Verhaaldata behoudt echte datums, volledige teksten en werkende `author.url`-bronvermeldingen; reacties hebben nu ook een link naar hun eigen anker. Archiefkaarten worden als een `ItemList` beschreven in plaats van losse forumverwijzingen. Dit is een semantische verbetering, geen garantie op een bepaalde zoekresultaatweergave.

`/robots.txt` houdt één algemene groep met `User-agent: *` en `Allow: /` en verwijst naar de canonieke sitemap. Dit laat ook huidige en toekomstige AI-crawlers toe; er zijn geen afzonderlijke botgroepen die per ongeluk een algemenere regel omzeilen. Beheer blijft met authenticatie beschermd en utilitypagina's gebruiken `noindex`; robotsregels zijn geen toegangsbeveiliging. Het sitemapbestand blijft alle echte verhaal-URL's, themapagina's en vaste archiefpaginering bevatten, ook als er deelsitemaps nodig zijn.

`/llms.txt` is een kleine, dynamische gids volgens de [llms.txt-opzet](https://llmstxt.org/). De gids linkt naar het archief, de sitemap, maximaal twaalf actuele thema's en zes leesroutes, en verklaart dat de inhoud persoonlijke archiefervaringen bevat. De HTML verwijst ernaar met `rel="describedby"`. Het is geen duplicaat van het volledige archief. Volgens [Google's eigen AI-richtlijnen](https://developers.google.com/search/docs/fundamentals/ai-optimization-guide) helpt of schaadt dit bestand Google-ranking niet; het dient als context voor andere systemen die het gebruiken. Een crawler moet de openbare pagina's zelf kunnen bereiken. De huidige live robots.txt is gecontroleerd; eventuele crawlerblokkades in een hosting-/Cloudflare-account worden door deze repository niet ingesteld.

### Webapp op iOS en Android

Het manifest behoudt dezelfde app-identiteit en start-URL (`/`), standalone-weergave en een vrije schermoriëntatie. De nieuwe maskable iconen zijn volledig ondoorzichtig en houden het logo binnen de centrale veilige cirkel voor Android-iconvormen. Het Apple-touch-icoon heeft een volle achtergrond zodat iOS zelf de hoeken kan afronden. De iconen worden uit `public/app-icon.svg` gerenderd met `npm run generate:icons` na het installeren van Playwright Chromium; hiervoor wordt geen productie-afhankelijkheid toegevoegd. Appshortcuts openen Leesroutes of Mijn leeslijst.

Installatiehulp staat in het bestaande venster **Over dit archief**. Een installatieknop verschijnt alleen als de browser een installatieverzoek beschikbaar stelt. Op iOS kies je de beginschermoptie in het deelmenu; in Android kun je ook het browsermenu gebruiken. Op iOS 26 kunnen gebruikers zelf kiezen om iedere website als webapp te openen. De opmaak houdt rekening met veilige schermranden en de thuisknopindicator. Een geïnstalleerde app kan eigen browseropslag hebben; leeslijsten worden niet automatisch tussen browserprofielen of de browser en webapp gekopieerd.

Alleen na installatie, of wanneer de site al als webapp draait, registreert de applicatie de service worker. Na een eerste online start bewaart die een kleine publieke fallback: offlinepagina, opmaak, icoon en voorkeurenscripts. Verhaalpagina's, bezochte URL's, adminpagina's, formulierverzoeken en leeslijstinhoud worden niet aan de appcache toegevoegd. Bestaande browseropslag blijft afzonderlijk werken. Een offline navigatie toont een tijdelijk, niet-indexeerbaar scherm met **Opnieuw proberen**, dat daarna dezelfde verhaal-URL opnieuw laadt. Nieuwe appversies vervangen oude appcaches zonder de leeslijst of privacykeuze te wissen. Dit is een rustige offline-melding, geen offline kopie van het archief. Navigatie blijft altijd de server gebruiken; fouten zoals 404/500 worden niet door een oude verhaalpagina gemaskeerd.

De browserregressies testen echte service-workerregistratie en offline/herstelgedrag in Chromium, native-installatiehooks via simulatie en de oudere iOS-standalone-detectie. Die simulatie vervangt geen controle van een daadwerkelijke Home Screen-installatie op een fysieke iPhone of Android-telefoon.

### Browsercontroles

De ontwikkeldependency Playwright draait afzonderlijke regressiecontroles voor paginering, resizing, terugnavigatie, delen/kopiëren, afdrukken, voorkeuren, het informatiedialoogvenster en mislukte netwerkverzoeken. De fixturegegevens staan in een tijdelijke map en gebruiken je echte archief niet.

```bash
npm ci
npx playwright install chromium
npm run test:browser
```

De Node 24-job in GitHub Actions voert deze browsercontroles ook uit. Een bestaande Chromium-installatie kan worden gekozen met `BROWSER_EXECUTABLE=/pad/naar/chromium npm run test:browser`. Docker installeert uitsluitend productieafhankelijkheden en neemt Playwright niet mee.
