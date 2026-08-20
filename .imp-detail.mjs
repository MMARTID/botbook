import { chromium } from 'playwright';
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('http://localhost:3011/landing', { waitUntil: 'load', timeout: 120000 });
await page.waitForLoadState('networkidle').catch(()=>{});
await page.waitForTimeout(3000);
const r = await page.evaluate(() => {
  const out = {};
  const img = document.querySelector('img[src*="logo"]');
  const ir = img.getBoundingClientRect();
  out.logo = { renderedW: Math.round(ir.width), renderedH: Math.round(ir.height), naturalW: img.naturalWidth, naturalH: img.naturalHeight, attrW: img.getAttribute('width'), attrH: img.getAttribute('height'), alt: img.getAttribute('alt') };
  // empty badge: spans with only an svg child and no text
  out.emptyInteractiveLike = [...document.querySelectorAll('span,div,button,a')].filter(el => {
    const t = (el.textContent||'').trim();
    const svgs = el.querySelectorAll('svg').length;
    const r = el.getBoundingClientRect();
    return t === '' && svgs === 1 && r.width > 16 && r.height > 16 && el.children.length <= 2 && !el.querySelector('span,div,p');
  }).map(el => ({ tag: el.tagName, cls: el.className.toString().slice(0,110), w: Math.round(el.getBoundingClientRect().width), h: Math.round(el.getBoundingClientRect().height), ariaLabel: el.getAttribute('aria-label'), ariaHidden: el.getAttribute('aria-hidden') }));
  // heading order
  out.headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')].map(h=>+h.tagName[1]);
  // form controls without accessible name
  out.controls = [...document.querySelectorAll('input,select,textarea')].map(el => {
    const id = el.id;
    const lab = id ? document.querySelector(`label[for="${id}"]`) : null;
    return { tag: el.tagName, type: el.type, id, hasLabel: !!lab, labelText: lab? lab.textContent.trim().slice(0,40):null, ariaLabel: el.getAttribute('aria-label'), h: Math.round(el.getBoundingClientRect().height) };
  });
  // buttons/links with no accessible name
  out.namelessControls = [...document.querySelectorAll('button,a')].filter(el => !(el.textContent||'').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')).map(el=>({tag:el.tagName, cls: el.className.toString().slice(0,80)}));
  // gap in conversation card
  const conv = document.querySelector('section[aria-label*="Ejemplos"]');
  if (conv) { const c = conv.getBoundingClientRect(); out.convCard = { w: Math.round(c.width), h: Math.round(c.height) }; }
  return out;
});
console.log(JSON.stringify(r, null, 2));
await b.close();
