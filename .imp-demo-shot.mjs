import { chromium } from 'playwright';
const b = await chromium.launch();
for (const [name, w, h] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const page = await b.newPage({ viewport: { width: w, height: h } });
  const errs = [];
  page.on('pageerror', (e) => errs.push(e.message.slice(0, 120)));
  await page.goto('http://localhost:3001/landing', { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.getByRole('button', { name: /Hablar con la demo/ }).click();
  await page.waitForTimeout(1200);
  await page.screenshot({ path: `/tmp/demo-dialog-${name}.png` });
  console.log(`${name}: dialogo ${await page.getByRole('dialog').count() ? 'abierto' : 'NO ABIERTO'} | errores: ${errs.length ? errs : 'ninguno'}`);
  await page.close();
}
await b.close();
