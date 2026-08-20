import { chromium } from 'playwright';
const b = await chromium.launch();
async function cssReady(page){ return page.evaluate(()=>{ let n=0; for(const s of document.styleSheets){ try{n+=s.cssRules.length}catch(e){} } return n; }); }
for (const [name,w,h] of [['desktop',1440,900],['mobile',390,844]]) {
  const ctx = await b.newContext({ viewport:{width:w,height:h}, isMobile:name==='mobile', hasTouch:name==='mobile' });
  const page = await ctx.newPage();
  let rules=0;
  for (let i=0;i<6;i++){
    await page.goto('http://localhost:3001/landing',{waitUntil:'load',timeout:120000});
    await page.waitForLoadState('networkidle').catch(()=>{});
    await page.waitForTimeout(2500);
    rules = await cssReady(page);
    console.log('  ['+name+'] intento '+(i+1)+': reglas CSS =', rules);
    if (rules > 500) break;
  }
  if (rules <= 500){ console.log('===',name,'ABORTADO: CSS no cargó'); await ctx.close(); continue; }
  await page.locator('button',{hasText:'Escuchar demo gratuita'}).first().click();
  const ok = await page.waitForSelector('.demo-call-modal',{timeout:15000}).then(()=>true).catch(()=>false);
  await page.waitForTimeout(1500);
  await page.screenshot({path:`/tmp/landing-${name}-modal.png`});
  console.log('===',name,'modal:',ok,'| reglas CSS:',await cssReady(page));
  if(!ok){await ctx.close();continue;}
  const m = await page.evaluate(()=>{ const vw=innerWidth,vh=innerHeight;
    const modal=document.querySelector('.demo-call-modal'),mr=modal.getBoundingClientRect();
    const over=[]; for(const el of modal.querySelectorAll('*')){const r=el.getBoundingClientRect();if(r.width===0&&r.height===0)continue;const cs=getComputedStyle(el);if(cs.display==='none'||cs.visibility==='hidden')continue;
      if(r.right>vw+1||r.left<-1||r.bottom>vh+1||r.top<-1)over.push({tag:el.tagName,cls:el.className.toString().slice(0,50),t:Math.round(r.top),b:Math.round(r.bottom),l:Math.round(r.left),r:Math.round(r.right)});}
    const small=[...modal.querySelectorAll('button,a,input')].filter(e=>{const r=e.getBoundingClientRect();return r.height>0&&r.height<44;}).map(e=>({tag:e.tagName,text:(e.textContent||'').trim().slice(0,26),size:Math.round(e.getBoundingClientRect().width)+'x'+Math.round(e.getBoundingClientRect().height)}));
    return {vw,vh,modal:{t:Math.round(mr.top),b:Math.round(mr.bottom),w:Math.round(mr.width),h:Math.round(mr.height)},overflowCount:over.length,over:over.slice(0,8),small,
      hasRoleDialog:!!document.querySelector('[role="dialog"]'),ariaModal:modal.getAttribute('aria-modal'),radius:getComputedStyle(modal).borderRadius,shadow:getComputedStyle(modal).boxShadow,bodyOverflow:getComputedStyle(document.body).overflow};});
  console.log(JSON.stringify(m,null,1));
  await ctx.close();
}
await b.close();
