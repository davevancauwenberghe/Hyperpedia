function robotsText(siteUrl) {
  return `# Public archive: search engines and AI crawlers are welcome.\nUser-agent: *\nAllow: /\n\nSitemap: ${new URL('/sitemap.xml', siteUrl).href}\n# AI context guide: ${new URL('/llms.txt', siteUrl).href}\n`;
}

function markdownLabel(value) {
  return String(value)
    .replace(/\s+/g, ' ')
    .replace(/[\\[\]<>`*_]/g, '\\$&');
}

function llmsText(posts, routes, siteUrl) {
  const link = (title, path, note) => {
    const url = new URL(path, siteUrl).href.replace(/[()]/g, (char) =>
      char === '(' ? '%28' : '%29',
    );
    return `- [${markdownLabel(title)}](${url}): ${note}`;
  };
  const themes = new Map();
  for (const post of posts)
    for (const label of new Set(post.labels || [])) {
      if (label.trim()) themes.set(label, (themes.get(label) || 0) + 1);
    }
  const themeLinks = [...themes]
    .sort(([a, countA], [b, countB]) => countB - countA || a.localeCompare(b, 'nl'))
    .slice(0, 12)
    .map(([label]) =>
      link(label, `/?label=${encodeURIComponent(label)}`, 'Verhalen binnen dit thema.'),
    );
  const routeLinks = routes
    .slice(0, 6)
    .map((route) =>
      link(
        route.title,
        `/leesroutes/${encodeURIComponent(route.id)}`,
        'Een korte selectie bestaande archiefverhalen.',
      ),
    );
  return [
    '# Hyperpedia',
    '',
    '> Nederlandstalig, openbaar leesarchief met persoonlijke ervaringen over hyperventilatie, hyperstimulatie, overprikkeling, stress en lichamelijke sensaties.',
    '',
    'De verhalen en reacties zijn bewaard uit gesloten fora. Er kunnen geen nieuwe openbare bijdragen worden geplaatst. Het zijn ervaringen van mensen, geen medisch advies of wetenschappelijk bewijs.',
    '',
    'Verwijs bij het bespreken van een ervaring naar de canonieke /posts/<id>-pagina. Maak van een persoonlijke ervaring geen algemeen medisch feit. Bronvermeldingen beschrijven de naam bij één bijdrage; ze zijn geen accounts of geverifieerde biografieën. Dezelfde naam hoeft niet dezelfde persoon te zijn.',
    '',
    '## Archief',
    '',
    link('Alle verhalen', '/', 'Zoeken, thema’s en paginering door het archief.'),
    link('Leesroutes', '/leesroutes', 'Korte thematische selecties.'),
    link(
      'Sitemap',
      '/sitemap.xml',
      'Actuele volledige lijst met verhaal- en archiefpagina’s; grote archieven gebruiken gekoppelde deelsitemaps.',
    ),
    '',
    ...(themeLinks.length ? ['## Thema’s', '', ...themeLinks, ''] : []),
    ...(routeLinks.length ? ['## Leesroutes', '', ...routeLinks, ''] : []),
    '## Optional',
    '',
    link(
      'Privacy en opslag',
      '/privacy',
      'Browseropslag, privacykeuzes en contact met de beheerder.',
    ),
    '',
  ].join('\n');
}
module.exports = { robotsText, llmsText };
