const { escapeHtml: e } = require('./html');
const { icon } = require('./icons');

function privacyPage() {
  const controller = process.env.PRIVACY_CONTROLLER;
  const contact = process.env.PRIVACY_CONTACT_URL;
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
      <p>De server en hostingprovider ontvangen technische verzoekgegevens, zoals je IP-adres, om pagina’s te leveren. Bij beheerlogin wordt dit tijdelijk gebruikt om mislukte pogingen te begrenzen. Verhaaltellingen bewaren geen IP-adressen: alleen totalen, totdat de beheerder ze verwijdert.</p>
      <p>Delen opent de deelopties van je browser op jouw verzoek. Externe links laden pas als je ze opent; die diensten hebben hun eigen privacybeleid.</p></div>
    </details>
  </section>`;
}
module.exports = { privacyPage };
