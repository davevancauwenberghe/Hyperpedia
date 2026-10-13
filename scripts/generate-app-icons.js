// Render the repository's vector mark; no production image library is required.
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
async function run() {
  const root = path.join(__dirname, '..');
  const svg = fs.readFileSync(path.join(root, 'public/app-icon.svg'), 'utf8');
  const browser = await chromium.launch({
    executablePath: process.env.BROWSER_EXECUTABLE || undefined,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--use-gl=angle',
      '--use-angle=swiftshader',
      '--enable-unsafe-swiftshader',
    ],
  });
  try {
    const page = await browser.newPage();
    for (const [size, filename] of [
      [192, 'icon-maskable-192.png'],
      [512, 'icon-maskable-512.png'],
      [180, 'apple-touch-icon.png'],
    ]) {
      await page.setViewportSize({ width: size, height: size });
      await page.setContent(
        `<style>html,body{margin:0}svg{display:block;width:100vw;height:100vh}</style>${svg}`,
      );
      await page.screenshot({ path: path.join(root, 'public', filename) });
    }
  } finally {
    await browser.close();
  }
}
run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
