import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const bad = [];
page.on('response', r => { if (r.status() >= 400) bad.push(r.status() + ' ' + r.url()); });
await page.goto('http://localhost:3001/landing', { waitUntil: 'load', timeout: 120000 });
await page.waitForLoadState('networkidle').catch(()=>{});
await page.waitForTimeout(4000);
const info = await page.evaluate(() => {
  const sheets = [...document.styleSheets].map(s => { let n=0; try{n=s.cssRules.length}catch(e){n=-1} return (s.href||'inline')+' reglas='+n; });
  const links = [...document.querySelectorAll('link[rel=stylesheet]')].map(l=>l.href);
  const el = document.querySelector('.btn-primary');
  const cs = el ? getComputedStyle(el) : null;
  return { sheets, links, btnPrimary: cs ? { display: cs.display, height: cs.height, bg: cs.backgroundColor } : null,
           bodyBg: getComputedStyle(document.body).backgroundColor,
           mainCls: document.querySelector('main')?.className.slice(0,60),
           mainBg: getComputedStyle(document.querySelector('main')).backgroundColor };
});
console.log('--- respuestas >=400 ---'); bad.forEach(x=>console.log(' ', x));
console.log('--- hojas de estilo ---'); console.log(JSON.stringify(info, null, 2));
await b.close();
