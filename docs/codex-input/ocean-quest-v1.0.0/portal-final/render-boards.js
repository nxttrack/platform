const { chromium } = require('playwright');
const path = require('path');

const root = __dirname;
const url = `file://${path.join(root, 'board.html')}`;

async function run() {
  const bundledChromium = process.env.CHROMIUM_PATH;
  const browser = await chromium.launch({
    headless: true,
    ...(bundledChromium ? {
      executablePath: bundledChromium,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    } : {}),
  });

  for (const config of [
    { mode: 'desktop', width: 2400, height: 2550 },
    { mode: 'mobile', width: 2400, height: 3370 },
  ]) {
    const page = await browser.newPage({
      viewport: { width: config.width, height: config.height },
      deviceScaleFactor: 2,
    });
    await page.goto(`${url}?mode=${config.mode}`, { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({
      path: path.join(root, 'boards', `NXTTRACK_Ocean_Quest_Complete_${config.mode}.png`),
      fullPage: true,
    });
    await page.close();
  }
  await browser.close();
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
