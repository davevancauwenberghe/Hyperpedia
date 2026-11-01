const { escapeHtml: e } = require('./html');
const { icon } = require('./icons');

function privacyPage() {
  const controller = process.env.PRIVACY_CONTROLLER;
  const contact = process.env.PRIVACY_CONTACT_URL;
  const logDays = Number(process.env.PRIVACY_LOG_RETENTION_DAYS);
  const logRetention =
    Number.isInteger(logDays) && logDays >= 1 && logDays <= 365
      ? `ongeveer ${logDays} dagen`
      : 'volgens de ingestelde bewaartermijn van de hosting; vraag de beheerder naar de actuele termijn';
  let contactUrl;
  try {
    const parsed = new URL(contact);
    if (['https:', 'mailto:'].includes(parsed.protocol)) contactUrl = parsed.href;
  } catch {}
  return `<section class="privacy-page" aria-labelledby="privacy-title">
    <header class="reading-page-heading"><p class="eyebrow">Jouw browser, jouw keuze</p><h1 id="privacy-title">Privacy &amp; opslag</h1><p>Lees het hele archief zonder optionele opslag. Hyperpedia gebruikt geen advertenties, externe analysetools of sociale tracking.</p></header>
    <div class="privacy-layout">
      <section class="panel" aria-labelledby="privacy-choices-title"><h2 id="privacy-choices-title">Jouw keuzes</h2>
        <form class="privacy-form" data-privacy-form hidden><fieldset><legend class="visually-hidden">Wat mogen we onthouden?</legend>
          <label class="privacy-option"><input type="checkbox" name="preferences"><span><strong>Leesvoorkeuren onthouden</strong><span>Bewaar je thema en leesinstellingen voor volgende bezoeken, alleen in deze browser. Zonder toestemming gelden ze voor deze browsersessie.</span></span></label>
          <label class="privacy-option"><input type="checkbox" name="statistics"><span><strong>Anonieme verhaaltelling</strong><span>Tel een geopend verhaal mee. Alleen een totaal per verhaal, zonder bezoekersprofiel of leesgeschiedenis.</span></span></label>
        </fieldset><p class="privacy-choice-note">Je keuze geldt één jaar. Je kunt deze hier altijd wijzigen of intrekken. Lezen en je leeslijst blijven beschikbaar.</p><div class="consent-actions"><button type="submit">Keuze opslaan</button><button class="secondary" type="button" data-consent-reject>Alles weigeren</button></div><p class="action-feedback" role="status" data-privacy-status></p></form>
        <noscript><p>JavaScript is uitgeschakeld. Optionele opslag en verhaaltellingen staan uit. Eerdere keuzes kun je wissen via de websitegegevens van je browser.</p></noscript>
      </section>
      <section class="panel privacy-overview" aria-labelledby="privacy-summary-title"><h2 id="privacy-summary-title">Goed om te weten</h2>
        <p><strong>Je leeslijst is van jou.</strong> Bewaarde verhalen blijven maximaal één jaar in deze browser en dit browserprofiel. Ze worden niet naar de server gestuurd of gesynchroniseerd. <a href="/leeslijst">Beheer je leeslijst</a>.</p>
        <p><strong>Je houdt de controle.</strong> Alles weigeren verwijdert voorkeuren voor volgende bezoeken. Je huidige sessie en leeslijst blijven bruikbaar. Websitegegevens wissen verwijdert ook je leeslijst en privacykeuze.</p>
        <p><strong>Geen persoonlijke leesgeschiedenis.</strong> Hyperpedia houdt geen leespositie, voortgang of profiel van je bezoeken bij.</p>
        ${controller || contactUrl ? `<div class="privacy-contact">${controller ? `<p>Beheerder: ${e(controller)}</p>` : ''}${contactUrl ? `<p>Vragen over privacy of een archiefbijdrage? <a href="${e(contactUrl)}">Neem contact op</a>.</p>` : ''}</div>` : ''}
      </section>
    </div>
    <details class="panel privacy-details"><summary>Meer over opslag en techniek ${icon('right')}</summary>
      <div class="privacy-details-content"><p>De privacykeuze wordt één jaar bewaard, ook als je weigert. Daarna vragen we opnieuw. Met toestemming bewaren we je thema, tekstgrootte, leesbreedte, focus en of Leesvoorkeuren open of dicht is. Intrekken wist deze duurzame voorkeuren en stopt toekomstige verhaaltellingen.</p>
      <div class="storage-table-wrap"><table class="storage-table"><caption>Opslag van Hyperpedia</caption><thead><tr><th scope="col">Opslag</th><th scope="col">Gebruik</th><th scope="col">Termijn</th></tr></thead><tbody>
        <tr><th scope="row"><code>hyperpedia-consent-v1</code></th><td>Noodzakelijk: je privacykeuze in deze browser</td><td>Eén jaar vanaf je keuze</td></tr>
        <tr><th scope="row"><code>hyperpedia-preferences-v1</code></th><td>Optioneel: leesvoorkeuren in deze browser</td><td>Tot toestemming vervalt of wordt ingetrokken</td></tr>
        <tr><th scope="row"><code>hyperpedia-session-preferences-v1</code></th><td>Functioneel: leesvoorkeuren voor deze sessie</td><td>Deze browsersessie</td></tr>
        <tr><th scope="row"><code>hyperpedia-reading-v2</code></th><td>Functioneel: zelf bewaarde verhalen in deze browser</td><td>Eén jaar per verhaal</td></tr>
        <tr><th scope="row"><code>hyperpedia-shell-*</code></th><td>Functioneel: offline-scherm en publieke opmaak van de geïnstalleerde webapp</td><td>Tot een app-update of websitegegevens wissen</td></tr>
        <tr><th scope="row"><code>hyperpedia_session</code></th><td>Noodzakelijk: beveiligde cookie voor beheerlogin</td><td>Deze sessie; zeven dagen bij zelf gekozen aangemeld blijven</td></tr>
      </tbody></table></div>
      <p>Alle browseropslag blijft lokaal. Alleen de beheercookie wordt naar Hyperpedia gestuurd; uitloggen maakt de sessie ongeldig. Een geïnstalleerde webapp bewaart geen bezochte verhaalpagina’s en kan een eigen leeslijst hebben. Een privévenster sluiten kan lokale gegevens verwijderen.</p>
      <p>Contabo verzorgt de hosting. Cloudflare verwerkt als verwerker technisch webverkeer, waaronder IP-adressen, voor levering, caching en beveiliging van de website. Meer informatie vind je in <a href="https://www.cloudflare.com/privacypolicy/">het privacybeleid van Cloudflare</a>.</p>
      <p>Technische serverlogs kunnen je IP-adres, tijdstip, opgevraagd pad en statuscode bevatten voor beveiliging en foutopsporing. We bewaren deze ${e(logRetention)}. De toegangslog bewaart geen zoektermen, verwijzende pagina of browseridentificatie. Deze logs worden niet gebruikt om een persoonlijk leesprofiel op te bouwen.</p>
      <p>Bij beheerlogin wordt je netwerkadres tijdelijk gebruikt om mislukte pogingen te begrenzen. Met toestemming telt een verhaal hoogstens eenmaal per kwartier per netwerkadres mee. Misbruikbeveiliging gebruikt kortlevende sleutels in het servergeheugen; die worden na ongeveer een kwartier opgeruimd en verdwijnen bij een herstart. De verhaaltelling bewaart op schijf alleen totalen per verhaal, totdat de beheerder ze verwijdert. Verhalen en reacties blijven in het archief totdat de beheerder ze verwijdert. Eerdere versies kunnen nog in beveiligde herstelkopieën staan totdat die worden vervangen; neem voor een verwijderverzoek contact op met de beheerder.</p>
      <p>Delen opent de deelopties van je browser op jouw verzoek. Externe links laden pas als je ze opent; die diensten hebben hun eigen privacybeleid.</p></div>
    </details>
  </section>`;
}
module.exports = { privacyPage };
