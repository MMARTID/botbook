import { chromium } from 'playwright';
const b = await chromium.launch();
for (const rm of ['reduce','no-preference']) {
  const ctx = await b.newContext({ viewport: { width: 1440, height: 900 }, reducedMotion: rm === 'reduce' ? 'reduce' : 'no-preference' });
  const page = await ctx.newPage();
  await page.goto('http://localhost:3011/landing', { waitUntil: 'load', timeout: 120000 });
  await page.waitForLoadState('networkidle').catch(()=>{});
  await page.waitForTimeout(3500);
  const r = await page.evaluate(() => {
    const running = document.getAnimations().map(a => {
      const t = a.effect && a.effect.target;
      return { type: a.constructor.name, name: (a.animationName || (a.effect && a.effect.getKeyframes && 'js-driven') || '?'),
               state: a.playState, iter: a.effect && a.effect.getTiming ? String(a.effect.getTiming().iterations) : '?',
               target: t ? t.tagName + '.' + (t.className && t.className.toString ? t.className.toString().slice(0,60) : '') : 'n/a' };
    });
    return { count: document.getAnimations().length, running: running.slice(0,20) };
  });
  console.log('=== prefers-reduced-motion:', rm, '=> animaciones activas:', r.count);
  for (const a of r.running) console.log('   -', a.type, 'iter='+a.iter, a.state, '|', a.target);
  // open the demo modal to test its motion
  await ctx.close();
}
await b.close();
