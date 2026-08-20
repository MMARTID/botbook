import { chromium } from 'playwright';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto('http://localhost:3001/landing', { waitUntil: 'load', timeout: 120000 });
await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(() => {});
await page.waitForTimeout(2000);
await page.screenshot({ path: '/tmp/brand-landing.png' });
await b.close();
