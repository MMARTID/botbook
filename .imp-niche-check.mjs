import { chromium } from 'playwright';
const b = await chromium.launch({ args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
for (const path of ['/peluqueria', '/barberia', '/landing']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['microphone'] });
  const page = await ctx.newPage();
  let captured = null;
  await page.route('**/api/backend/demo/web-call', async (route) => {
    captured = route.request().postData();
    await route.fulfill({ status: 503, json: { code: 'DEMO_NOT_CONFIGURED', error: 'x' } });
  });
  await page.goto(`http://localhost:3001${path}`, { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
  await page.getByRole('button', { name: /Hablar con la demo/ }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole('button', { name: /Empezar demo/ }).click();
  await page.waitForTimeout(2500);
  console.log(`${path}: body recibido -> ${captured}`);
  await ctx.close();
}
await b.close();
