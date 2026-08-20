import { chromium } from 'playwright';
import fs from 'node:fs';

const token = fs.readFileSync('/tmp/imp-app-token.txt', 'utf8').trim();
const base = 'http://localhost:3001';
const b = await chromium.launch();

for (const [name, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: name === 'mobile', hasTouch: name === 'mobile' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message.slice(0, 160)));
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 200)); });

  await page.goto(`${base}/login`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate((t) => window.localStorage.setItem('botbook_token', t), token);
  await page.goto(`${base}/register/business`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `/tmp/reg2-business-${name}.png` });

  const info = await page.evaluate(() => ({
    path: location.pathname,
    svg: Boolean(document.querySelector('main svg, .panel svg')),
    heading: document.querySelector('h2')?.textContent ?? null,
  }));
  console.log(`${name}: ruta ${info.path} | h2 "${info.heading}" | svg ${info.svg ? 'presente' : 'AUSENTE'} | errores: ${errs.length ? errs : 'ninguno'}`);
  await ctx.close();
}
await b.close();
