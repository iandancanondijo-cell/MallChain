const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()));
  page.on('pageerror', err => console.log('PAGE ERROR:', err.message));
  // detect preview port: first check PREVIEW_PORT env, otherwise scan common Vite ports
  async function findPreviewPort(){
    const envPort = process.env.PREVIEW_PORT
    if(envPort) return envPort
    const ports = [5173,5174,5175,5176,5177,5178,5179,5180]
    for(const p of ports){
      try{
        const res = await fetch(`http://localhost:${p}/`)
        if(res.ok){
          const text = await res.text()
          if(text && text.toLowerCase().includes('marketplace')) return p
        }
      }catch(e){ /* ignore connection errors */ }
    }
    throw new Error('preview server not found on common ports; set PREVIEW_PORT')
  }

  const port = await findPreviewPort()
  const url = `http://localhost:${port}/?token=testtoken`
  console.log('navigating to', url);
  await page.goto(url, { waitUntil: 'networkidle' });
  // dump a small portion of HTML for debugging
  const html = await page.content();
  console.log('page HTML snapshot (first 800 chars):\n', html.slice(0,800));
  // wait for landing global to be available, then navigate to mallcoin view
  // Wait for the Mallcoin view to become available; try direct navigation or landing hook
  try{
    await page.waitForSelector('text=Mallcoin', { timeout: 15000 })
  }catch(e){
    // fallback: use landing navigation hook if available
    try{
      await page.waitForFunction(() => !!window.__landingNavigate, { timeout: 5000 })
      await page.evaluate(() => window.__landingNavigate && window.__landingNavigate('mallcoin'))
      await page.waitForSelector('text=Mallcoin', { timeout: 15000 })
    }catch(e2){
      throw new Error('Mallcoin view did not appear')
    }
  }

  await page.waitForSelector('text=Create Wallet', { timeout: 20000 });

  // create mnemonic
  await page.click('text=Generate mnemonic');
  await page.waitForTimeout(200);

  // fill password
  await page.fill('input[placeholder="password to encrypt key"]', 'testpass123');
  await page.click('text=Encrypt & Export');
  // wait for export textarea to appear with JSON
  await page.waitForFunction(() => {
    const t = Array.from(document.querySelectorAll('textarea')).find(x => x.value && x.value.trim().startsWith('{'));
    return !!t;
  }, { timeout: 5000 });

  const exported = await page.evaluate(() => {
    const t = Array.from(document.querySelectorAll('textarea')).find(x => x.value && x.value.trim().startsWith('{'));
    return t ? t.value : null;
  });

  if(!exported) {
    console.error('No exported keystore found');
    await browser.close();
    process.exit(2);
  }
  console.log('exported keystore length', exported.length);

  // paste into unlock textarea
  await page.fill('textarea[placeholder="paste encrypted JSON export here"]', exported);
  await page.fill('input[placeholder="password"]', 'testpass123');
  await page.click('text=Unlock');

  // wait for wallet loaded indicator
  await page.waitForSelector('text=Wallet loaded:', { timeout: 5000 });
  const loadedText = await page.evaluate(() => {
    const el = Array.from(document.querySelectorAll('div')).find(d => d.textContent && d.textContent.includes('Wallet loaded:'));
    return el ? el.textContent.trim() : null;
  });
  console.log('loadedText:', loadedText);

  await browser.close();
  if(loadedText) process.exit(0); else process.exit(3);
})();
