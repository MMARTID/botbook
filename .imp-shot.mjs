import { chromium } from 'playwright';
import fs from 'node:fs';
const url = 'http://localhost:3011/landing';
const out = [];
const b = await chromium.launch();
for (const [name, w, h] of [['desktop',1440,900],['mobile',390,844]]) {
  const ctx = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 1, isMobile: name==='mobile', hasTouch: name==='mobile' });
  const page = await ctx.newPage();
  const errs = [];
  page.on('console', m => { if (m.type()==='error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('PAGEERROR: '+e.message));
  const resp = await page.goto(url, { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('networkidle', { timeout: 120000 }).catch(()=>{});
  // gate: wait until the .btn-primary utility really resolves to 40px tall
  await page.waitForFunction(() => {
    const el = document.querySelector('.btn-primary');
    if (!el) return false;
    return Math.round(el.getBoundingClientRect().height) >= 39;
  }, null, { timeout: 60000 }).catch(e => errs.push('GATE_TIMEOUT: '+e.message));
  await page.waitForTimeout(3000);
  const sanity = await page.evaluate(() => {
    const el = document.querySelector('.btn-primary');
    const r = el.getBoundingClientRect();
    return { btnPrimaryH: Math.round(r.height), btnPrimaryW: Math.round(r.width), sheets: document.styleSheets.length };
  });
  await page.screenshot({ path: `/tmp/landing-${name}-fold.png` });
  await page.screenshot({ path: `/tmp/landing-${name}-full.png`, fullPage: true });
  const m = await page.evaluate(() => {
    const de = document.documentElement, vw = window.innerWidth;
    const cn = el => (el.className && el.className.toString ? el.className.toString() : '').slice(0,80);
    const over = [];
    for (const el of document.querySelectorAll('body *')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility==='hidden'||cs.display==='none'||cs.position==='fixed') continue;
      if (r.right > vw + 1 || r.left < -1) over.push({ tag: el.tagName, cls: cn(el), left: Math.round(r.left), right: Math.round(r.right) });
    }
    const small = [];
    for (const el of document.querySelectorAll('a,button,input,select,textarea,summary,[role="button"]')) {
      const r = el.getBoundingClientRect();
      if (r.width===0||r.height===0) continue;
      if (r.height < 44) small.push({ tag: el.tagName, text: (el.textContent||'').trim().slice(0,38), w: Math.round(r.width), h: Math.round(r.height), cls: cn(el) });
    }
    return { docScrollW: de.scrollWidth, vw, overCount: over.length, over: over.slice(0,20), smallCount: small.length, small, fullH: de.scrollHeight };
  });
  out.push({ name, status: resp.status(), sanity, errs, ...m });
  await ctx.close();
}
await b.close();
fs.writeFileSync('/tmp/browser-evidence.json', JSON.stringify(out, null, 2));
for (const o of out) {
  console.log('=====', o.name, 'status', o.status, '| sanity btn-primary h=' + o.sanity.btnPrimaryH + 'px, hojas CSS=' + o.sanity.sheets);
  console.log('  vw', o.vw, 'docScrollW', o.docScrollW, '=> desbordamiento horizontal:', o.docScrollW > o.vw ? 'SI (+'+(o.docScrollW-o.vw)+'px)' : 'no');
  console.log('  altura total', o.fullH, 'px');
  console.log('  elementos fuera del viewport:', o.overCount);
  for (const x of o.over) console.log('    -', x.tag, 'left', x.left, 'right', x.right, '|', x.cls);
  console.log('  targets <44px alto:', o.smallCount);
  for (const x of o.small) console.log('    -', x.tag, x.w+'x'+x.h, '|', JSON.stringify(x.text), '|', x.cls);
  console.log('  errores consola:', o.errs.length ? o.errs : 'ninguno');
}
