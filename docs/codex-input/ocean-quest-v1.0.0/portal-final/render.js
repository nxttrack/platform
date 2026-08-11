const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const screens = [
  'overview', 'planning', 'lesson', 'development', 'badges', 'media',
  'diplomas', 'inbox', 'payments', 'documents', 'feedback', 'children', 'profile'
];

const root = __dirname;
const url = `file://${path.join(root, 'index.html')}`;

async function render() {
  const bundledChromium = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(bundledChromium ? {
      executablePath: bundledChromium,
      args: [
        '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
        '--disable-gpu', '--disable-web-security',
      ],
    } : {}),
  });
  fs.mkdirSync(path.join(root, 'screens', 'desktop'), { recursive: true });
  fs.mkdirSync(path.join(root, 'screens', 'mobile'), { recursive: true });

  for (const screen of screens) {
    const desktop = await browser.newPage({
      viewport: { width: 1920, height: 1080 },
      deviceScaleFactor: 2,
    });
    await desktop.goto(`${url}?screen=${screen}${screen === 'profile' ? '&profilemenu=1' : ''}`, { waitUntil: 'load' });
    await desktop.evaluate(() => document.fonts.ready);
    await desktop.screenshot({
      path: path.join(root, 'screens', 'desktop', `${screen}.png`),
      fullPage: false,
    });
    await desktop.close();

    const mobile = await browser.newPage({
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
    });
    await mobile.goto(`${url}?screen=${screen}${screen === 'profile' ? '&profilemenu=1' : ''}`, { waitUntil: 'load' });
    await mobile.evaluate(() => document.fonts.ready);
    await mobile.screenshot({
      path: path.join(root, 'screens', 'mobile', `${screen}.png`),
      fullPage: false,
    });
    await mobile.close();
  }

  await browser.close();
}

render().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
