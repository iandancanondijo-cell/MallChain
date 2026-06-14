const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  page.on('console', (m) => console.log('PAGE:', m.text()));
  page.on('pageerror', (err) => console.error('PAGE ERROR:', err));

  const url = 'http://localhost:5173/buy';
  console.log('GOING TO', url);
  await page.goto(url, { waitUntil: 'networkidle' });

  try {
    await page.waitForSelector('[aria-label="mallcoin-amount"]', { timeout: 5000 });
  } catch (e) {
    console.error('Amount input not found:', e.message);
    await browser.close();
    process.exit(2);
  }

  await page.fill('[aria-label="mallcoin-amount"]', '5');
  await page.waitForTimeout(600);
  let fiat = 'MISSING';
  try {
    fiat = await page.inputValue('[aria-label="fiat-value"]');
  } catch (e) {
    console.error('Could not read fiat input:', e.message);
  }

  console.log('FIAT_VALUE:', fiat);
  await browser.close();
  process.exit(0);
})();
