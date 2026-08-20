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

  // 1. Registro (pública): icono animado de Google Maps
  await page.goto(`${base}/register/business`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `/tmp/reg-business-${name}.png` });

  // 2. Ajustes sin calendario: la animación del calendario sigue funcionando tras el refactor
  await page.route('**/api/backend/business/me', async (route) => {
    const resp = await route.fetch();
    const json = await resp.json();
    json.outlookCalendarConnected = false;
    json.googleCalendarConnected = false;
    await route.fulfill({ response: resp, json });
  });
  await page.goto(`${base}/login`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate((t) => window.localStorage.setItem('botbook_token', t), token);
  await page.goto(`${base}/ajustes?section=calendar-section`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2500);
  await page.locator('#calendar-section').screenshot({ path: `/tmp/anim2-calendario-${name}.png` });

  const info = await page.evaluate(() => ({
    regSvg: Boolean(document.querySelector('svg')),
    calSvg: Boolean(document.querySelector('#calendar-section svg')),
    vw: window.innerWidth,
    docScrollW: document.documentElement.scrollWidth,
  }));
  console.log(`${name}: svg calendario ${info.calSvg ? 'presente' : 'AUSENTE'} | overflowH ${info.docScrollW > info.vw ? 'SI' : 'no'} | errores: ${errs.length ? errs : 'ninguno'}`);
  await ctx.close();
}
await b.close();
