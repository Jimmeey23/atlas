import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { reportRoutes } from '../server/reports.mjs';
import { presentationRoutes } from '../server/presentation.mjs';
import { stickyNoteRoutes } from '../server/sticky-notes.mjs';

// Exercise real report/session/note routes with an isolated database fixture; no production writes.
const documents=new Map();
const store={read:async key=>structuredClone(documents.get(key)??null),write:async(key,value)=>{documents.set(key,structuredClone(value));}};
const cloud={from:()=>({select:()=>({like:async(_,prefix)=>({data:[...documents.keys()].filter(key=>key.startsWith(prefix.replace(/%$/,''))).map(key=>({key})),error:null})})})};
const api=express();api.use(express.json({limit:'20mb'}));reportRoutes(api,store,cloud);presentationRoutes(api,store);stickyNoteRoutes(api,store,cloud);
const http=api.listen(0,'127.0.0.1');await new Promise(resolve=>http.once('listening',resolve));
const vite=await createServer({server:{host:'127.0.0.1',port:5199,strictPort:true,proxy:{'/api':`http://127.0.0.1:${http.address().port}`}}});
let browser;
const model={scope:{studio:'Kenkere House',month:'2026-09'},builtAt:'2026-10-10T00:00:00Z',figuresHash:'review-fixture',schemaVersion:6,chapters:{},narratives:{},customization:{title:'Review verification',subtitle:'',preparedFor:'',preparedBy:'',audience:'Studio leadership',tone:'Professional',detail:'Comprehensive',instructions:'',chapterIds:['sessions','revenue-performance'],theme:'light',showCharts:true}};
for(const id of model.customization.chapterIds){model.chapters[id]={id,n:10,total:{sessions:10,attendance:80,gross_revenue:100000},prior:{sessions:8,attendance:60,gross_revenue:80000},priorYear:{},groups:[{id:'format',field:'format',title:'Signature experience breakdown',columns:['attendance'],compare:'attendance',minimum:'At least three records',rows:[{g:'Barre',attendance:50},{g:'Mat',attendance:30}],prior:{Barre:{attendance:40},Mat:{attendance:20}},priorYear:{},total:{attendance:80}}],history:[{month:'2026-08',attendance:60,sessions:8,gross_revenue:80000},{month:'2026-09',attendance:80,sessions:10,gross_revenue:100000}]};model.narratives[id]={generated:true,summary:`Frozen ${id} analysis`,cards:[{headline:'Monthly performance verdict',meaning:'Frozen baseline',evidence:'Stored figures',action:'',focus:'kpis'},{headline:'Barre attendance improved',meaning:'Barre has 50 of 80 visits.',evidence:'50 vs 40 visits in August',action:'Review timetable capacity.',focus:'format',metrics:['attendance'],lens:'win',driver:'Observed increase; cause is not established.',priority:'medium'},{headline:'Attendance rose alongside session supply',meaning:'Visits increased from 60 to 80 while sessions increased from 8 to 10.',evidence:'Saved monthly figures',action:'Compare attendance per session.',focus:'trend',metrics:['attendance','sessions'],lens:'driver',priority:'low'}]};}
try {
 await vite.listen();const url='http://127.0.0.1:5199';
 browser=await chromium.launch({headless:true});
 const hostContext=await browser.newContext({viewport:{width:1440,height:1000}});
 const host=await hostContext.newPage();const errors=[];host.on('pageerror',e=>errors.push(e.message));
 await host.goto(`${url}/report`);
 // Open through the actual export entry point, preserving a real new-tab storage transfer.
 await host.evaluate(model=>{window.reviewFixture=model;},model);
 await host.evaluate(async()=>{const {openReportPage}=await import('/src/report/export.ts');window.launchReview=()=>openReportPage(document.body,window.reviewFixture);});
 await host.evaluate(()=>{const button=document.createElement('button');button.id='launch-review';button.textContent='Open review';button.onclick=()=>void window.launchReview();document.body.append(button);});
 const popupPromise=host.waitForEvent('popup');await host.locator('#launch-review').click();const review=await popupPromise;
 review.on('pageerror',e=>errors.push(e.message));
 await review.waitForURL(/\/report\?id=/,{timeout:60000});
 await review.locator('.report-doc').waitFor();
 const tools=review.getByRole('button',{name:'Review tools',exact:true});
 assert.equal(await tools.getAttribute('aria-expanded'),'false');
 assert.equal(await review.locator('[aria-label="Annotation tools"]').isVisible(),false);
 await tools.click();
 await review.waitForFunction(()=>document.querySelector('.floating-review').dataset.open==='false',{},{timeout:10000});
 await tools.click();
 assert.equal(await review.locator('[aria-label="Annotation tools"]').isVisible(),true);
 // Appearance restyles the saved snapshot without changing it.
 const appearance=async()=>{if(!(await review.getByLabel('Report layout',{exact:true}).isVisible()))await review.getByRole('button',{name:'Appearance',exact:true}).click();};
 await appearance();
 for(const layout of ['adaptive','full','grid']){await review.getByLabel('Report layout',{exact:true}).selectOption(layout);}
 await review.getByLabel('Report theme',{exact:true}).selectOption('dark:warm');await review.getByLabel('Report accent',{exact:true}).selectOption('indigo');
 assert.equal(await review.locator('.report-doc').getAttribute('data-surface'),'warm');assert.equal(await review.locator('.report-doc').getAttribute('data-report-theme'),'dark');
 await review.getByLabel('Report theme',{exact:true}).selectOption('light:paper');await review.getByLabel('Report layout',{exact:true}).selectOption('adaptive');
 await review.getByRole('button',{name:'Appearance',exact:true}).click();
 // Chapter tabs → insights keep their evidence drilldowns.
 await review.locator('.deck-tabs button',{hasText:'Schedule'}).click();
 await review.locator('.deck-sections').getByRole('tab',{name:/Insights/}).click();
 const insight=review.locator('.r2-insight').first();await insight.getByRole('button',{name:'Explore data: Barre attendance improved'}).click();
 assert.equal(await insight.locator('.r-insight-drilldown').getAttribute('open'),'');
 const liveLink=new URL(await insight.getByRole('link',{name:/Open full source analytics/}).getAttribute('href'));
 assert.equal(liveLink.searchParams.get('tab'),'1');assert.deepEqual(JSON.parse(liveLink.searchParams.get('f')),{from:'2026-09-01',to:'2026-09-30',location:['Kenkere House']});
 await insight.getByRole('button',{name:'Detail',exact:true}).click();
 assert.ok((await insight.innerText()).includes('Previous month'));assert.ok((await insight.innerText()).includes('Mat'));assert.ok((await insight.innerText()).includes('stored in this snapshot'));
 await insight.scrollIntoViewIfNeeded();await review.screenshot({path:'/tmp/atlas-report-cards-desktop.png'});
 // The navbar stays fixed at the very top while pages scroll.
 await review.locator('#main').evaluate(el=>el.scrollTop=700);await review.waitForTimeout(100);
 assert.equal(Math.round((await review.locator('.deck-nav').boundingBox()).y),0,'navbar pinned at the top');
 // Metric cards flip to their history.
 await review.locator('.deck-sections').getByRole('tab',{name:/Verdict/}).click();
 const flip=review.locator('.deck-flip').first();await flip.locator('.deck-flip-front').click();assert.equal(await flip.getAttribute('data-flipped'),'true');
 // Exported HTML keeps native drilldowns and the headline shortcut without React.
 const downloadPromise=review.waitForEvent('download');await review.getByRole('button',{name:'Download HTML',exact:true}).click();
 const exported=await (await import('node:fs/promises')).readFile(await (await downloadPromise).path(),'utf8');
 const file=await hostContext.newPage();await file.setContent(exported);await file.locator('.r-insight-title').first().click();
 assert.equal(await file.locator('.r-insight-drilldown').first().getAttribute('open'),'');await file.close();
 await review.locator('.deck-tabs button').first().click();
 if(await tools.getAttribute('aria-expanded')==='false')await tools.click();
 assert.equal(await review.locator('[aria-label="Presenter toolkit"]').isVisible(),true);
 await review.getByRole('button',{name:'Sound clips',exact:true}).click();await review.getByRole('searchbox',{name:'Search sound clips'}).waitFor();
 assert.ok(await review.locator('.sound-list button').count()>0);
 await review.getByRole('button',{name:'Close presentation tools'}).click();
 await review.getByRole('button',{name:'Host a session',exact:true}).click();
 await review.locator('.presentation-panel').getByRole('button',{name:'Host a session',exact:true}).click();
 await review.getByRole('button',{name:'Copy invite link'}).waitFor();
 const code=await review.locator('.presentation-panel p strong').innerText();
 const id=new URL(review.url()).searchParams.get('id');assert.ok(id);
 const guestContext=await browser.newContext({viewport:{width:1280,height:900}});
 const guest=await guestContext.newPage();guest.on('pageerror',e=>errors.push(e.message));
 await guest.goto(`${url}/report?id=${id}&session=${code}`);await guest.getByRole('button',{name:'Join session',exact:true}).click();
 await guest.getByRole('button',{name:'Following host',exact:true}).waitFor();
 await review.getByRole('button',{name:'Close presentation tools'}).click();
 await review.getByRole('button',{name:'Next chapter',exact:true}).click();
 await guest.waitForFunction(()=>document.querySelector('[aria-label="Presentation chapter"]').value==='sessions');
 // Host drawing is shared; guests retain host authority boundaries and add their own notes.
 await review.getByRole('button',{name:'pen',exact:true}).click();
 const box=await review.locator('.presentation-ink').boundingBox();await review.mouse.move(box.x+100,box.y+100);await review.mouse.down();await review.mouse.move(box.x+240,box.y+150);await review.mouse.up();
 await guest.waitForFunction(()=>document.querySelectorAll('.presentation-ink polyline').length===1);
 if(await tools.getAttribute('aria-expanded')==='false')await tools.click();
 await review.getByRole('button',{name:'Add note',exact:true}).click();
 const wizard=review.getByRole('dialog',{name:'Sticky note wizard'});
 await wizard.getByLabel('Your name',{exact:true}).fill('Host reviewer');await wizard.getByLabel('Note title',{exact:true}).fill('Shared decision');await wizard.getByLabel('Note text',{exact:true}).fill('Confirm the follow-up owner.');await wizard.getByRole('button',{name:'Choose position'}).click();
 await review.locator('#main').click({position:{x:320,y:220}});
 await guest.locator('[data-note-id]').waitFor({timeout:15000});
 assert.equal(await guest.locator('[data-note-id] textarea').inputValue(),'Confirm the follow-up owner.');
 await guest.locator('[data-note-id] textarea').fill('Owner confirmed by guest.');
 await review.waitForFunction(()=>document.querySelector('[data-note-id] textarea')?.value==='Owner confirmed by guest.');
 // Another snapshot never receives these notes.
 const other={...model,id:randomUUID(),savedAt:new Date().toISOString()};await store.write(`.floor/reports/${other.id}.json`,other);
 const separate=await guestContext.newPage();await separate.goto(`${url}/report?id=${other.id}`);await separate.locator('.report-doc').waitFor();assert.equal(await separate.locator('[data-note-id]').count(),0);
 if(await guest.getByRole('button',{name:'Review tools',exact:true}).getAttribute('aria-expanded')==='false')await guest.getByRole('button',{name:'Review tools',exact:true}).click();
 await guest.getByRole('button',{name:'Following host',exact:true}).click();
 await guest.getByRole('button',{name:'Next chapter',exact:true}).click();assert.equal(await guest.getByLabel('Presentation chapter').inputValue(),'revenue-performance');
 if(await tools.getAttribute('aria-expanded')==='false')await tools.click();
 await review.getByRole('button',{name:'Live session',exact:true}).click();await review.getByRole('button',{name:'Pause sharing',exact:true}).click();
 await guest.waitForFunction(()=>document.querySelector('.session-status')?.textContent.includes('Paused'));
 await review.getByRole('button',{name:'Resume sharing',exact:true}).click();
 await guest.getByRole('button',{name:'Explore independently',exact:true}).click();
 await guest.waitForFunction(()=>document.querySelector('[aria-label="Presentation chapter"]').value==='sessions');
 await guest.getByRole('button',{name:'Raise hand',exact:true}).click();await review.waitForFunction(()=>document.querySelector('.session-roster')?.textContent.includes('Hand raised'));
 await review.getByRole('button',{name:'Close presentation tools'}).click();
 await review.screenshot({path:'/tmp/atlas-report-review-desktop.png'});
 await separate.setViewportSize({width:390,height:844});
 await separate.screenshot({path:'/tmp/atlas-report-review-mobile.png'});
 const overflow=await separate.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
 assert.equal(overflow,false,'mobile page should not overflow horizontally');
 await separate.getByRole('button',{name:'Review tools',exact:true}).click();
 assert.equal(await separate.getByRole('button',{name:'Add note',exact:true}).isVisible(),true);
 assert.equal(await separate.getByRole('button',{name:'Sound clips',exact:true}).isVisible(),true);
 const navBounds=await separate.getByRole('button',{name:'Next chapter',exact:true}).boundingBox();assert.ok(navBounds.x+navBounds.width<=390,'next chapter stays visible on mobile');
 // Opening a local snapshot still retains its report and tools if database storage fails.
 const local=await hostContext.newPage();
 await local.route('**/api/reports',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Storage unavailable for verification.'})}));
 await local.goto(`${url}/report`);
 const draft=randomUUID();await local.evaluate(({draft,model})=>sessionStorage.setItem(`atlas-report-page:${draft}`,JSON.stringify(model)),{draft,model});
 await local.goto(`${url}/report?draft=${draft}`);await local.locator('.report-doc').waitFor();
 await local.getByRole('button',{name:'Review tools',exact:true}).click();
 assert.equal(await local.getByRole('button',{name:'Add note',exact:true}).isVisible(),true);
 await local.getByRole('button',{name:'Host a session',exact:true}).click();await local.locator('.presentation-panel').getByRole('button',{name:'Host a session',exact:true}).click();
 await local.getByRole('alert').filter({hasText:'Storage unavailable for verification.'}).waitFor();

 await review.reload();await review.locator('[data-note-id]').waitFor();
 assert.equal(await review.locator('[data-note-id] textarea').inputValue(),'Owner confirmed by guest.');
 assert.deepEqual(errors,[]);
 console.log('PASS: deck tabs, saved-snapshot drilldowns, appearance, fixed navbar, flip cards, floating toolkit auto-collapse, new-tab snapshot, full toolkit, host/join, chapter/ink sharing, independent navigation, pause/resume, raised hands, shared notes, isolation, reload and mobile overflow.');
} finally {await browser?.close();await vite.close();http.closeAllConnections();await new Promise(resolve=>http.close(resolve));}
