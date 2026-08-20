import { chromium } from 'playwright';
import fs from 'node:fs';

const token = fs.readFileSync('/tmp/imp-app-token.txt', 'utf8').trim();
const base = 'http://localhost:3001';
const routes = ['/', '/ajustes', '/ajustes/facturacion'];
const out = [];

const b = await chromium.launch();
for (const [name, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));

  await page.goto(`${base}/login`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate((t) => window.localStorage.setItem('botbook_token', t), token);

  for (const route of routes) {
    const tag = route === '/' ? 'panel' : route.replaceAll('/', '').replace('ajustesfacturacion', 'facturacion');
    const resp = await page.goto(`${base}${route}`, { waitUntil: 'load', timeout: 120000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
    await page.waitForTimeout(2500);
    await page.screenshot({ path: `/tmp/app-${tag}-${name}.png`, fullPage: true });
    const m = await page.evaluate(() => {
      const de = document.documentElement;
      return { vw: window.innerWidth, docScrollW: de.scrollWidth, url: location.pathname };
    });
    out.push({ name, route, status: resp.status(), landed: m.url, hOverflow: m.docScrollW > m.vw ? `SI (+${m.docScrollW - m.vw}px)` : 'no', errs: errs.length });
    errs.length = 0;
  }
  await ctx.close();
}
await b.close();
for (const o of out) console.log(`${o.name} ${o.route} -> ${o.landed} | status ${o.status} | overflowH: ${o.hOverflow} | errores consola: ${o.errs}`);
