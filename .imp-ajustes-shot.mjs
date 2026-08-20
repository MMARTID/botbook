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
  page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)); });

  await page.goto(`${base}/login`, { waitUntil: 'load', timeout: 120000 });
  await page.evaluate((t) => window.localStorage.setItem('botbook_token', t), token);
  await page.goto(`${base}/ajustes`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: `/tmp/aj2-colapsado-${name}.png`, fullPage: true });

  // Abrir la sección de calendario y el selector
  await page.getByRole('button', { name: /Calendario/ }).first().click();
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: 'Cambiar de calendario' }).click();
  await page.waitForTimeout(1500);
  await page.locator('#calendar-section').screenshot({ path: `/tmp/aj2-calendario-${name}.png` });

  // Abrir una sección de edición para comprobar el contenido plegable
  await page.getByRole('button', { name: /Servicios/ }).first().click();
  await page.waitForTimeout(600);
  await page.locator('#services').screenshot({ path: `/tmp/aj2-servicios-${name}.png` });

  const m = await page.evaluate(() => ({ vw: window.innerWidth, docScrollW: document.documentElement.scrollWidth }));
  console.log(`${name}: overflowH ${m.docScrollW > m.vw ? 'SI' : 'no'} | errores: ${errs.length ? errs : 'ninguno'}`);
  await ctx.close();
}
await b.close();
