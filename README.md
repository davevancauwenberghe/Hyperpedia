# Hyperpedia

Hyperpedia is een rustige Nederlandstalige encyclopedie met forumverhalen over hyperventilatie, vreemde lichamelijke sensaties, hyperarousal, stress en zenuwstelselontregeling.

## Veilige login instellen

1. Kies één beheerderaccount; alleen ingelogde beheerders kunnen verhalen toevoegen of bewerken.
2. Gebruik een uniek wachtwoord van minimaal 16 tekens, bij voorkeur uit een wachtwoordmanager.
3. Het wachtwoord wordt nooit plaintext opgeslagen: `scripts/create-admin.js` hasht het met PBKDF2-SHA256 met 310.000 iteraties voordat het in de data-mount komt.
4. Bewaar `SESSION_SECRET` als Fly secret voor stabiele ondertekening van cookies. Als deze secret ontbreekt start de app met een tijdelijke secret zodat Fly-healthchecks niet falen. Sessies staan in het servergeheugen en eindigen bij iedere restart of deploy; daarna log je opnieuw in.
le -a hyper -C 'cd /app && node scripts/create-admin.js beheerder "een-heel-lang-uniek-wachtwoord"'

## Validatie en opslag

Onleesbare of corrupte archiefbestanden veroorzaken nu een fout in plaats van een leeg archief dat later overschreven kan worden. Herstel zo'n bestand vanuit een back-up voordat je verder bewerkt.

## Versies en onderhoud

Inloguploads zijn afzonderlijk begrensd: maximaal 8 KiB per formulier, één actieve upload per clientadres en 16 tegelijk. Een upload moet binnen vijf seconden klaar zijn; geweigerde of verlopen uploads sluiten de verbinding. Deze limieten staan los van de vier gelijktijdige wachtwoordcontroles.

### Privacykeuze en browseropslag

De compacte banner en `/privacy` bieden even zichtbare knoppen om optionele functies toe te staan of te weigeren. Leesvoorkeuren over bezoeken heen en de verhaaltelling kunnen afzonderlijk worden gekozen. Beide staan standaard uit. Zonder toestemming werken voorkeuren alleen in `sessionStorage`; alleen na toestemming wordt de voorkeurenopslag in `localStorage` gelezen of geschreven. De verhaaltelling verstuurt pas na toestemming een verzoek, zonder cookies mee te sturen, en bewaart uitsluitend het totaal per verhaal. Leeslijstgegevens worden nooit naar de server gestuurd.
