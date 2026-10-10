import assert from 'node:assert/strict';
import express from 'express';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
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
const model={scope:{studio:'Kenkere House',month:'2026-09'},builtAt:'2026-10-10T00:00:00Z',figuresHash:'review-fixture',schemaVersion:6,chapters:{},narratives:{},customization:{title:'Review verification',subtitle:'',preparedFor:'',preparedBy:'',audience:'Studio leadership',tone:'Professional',detail:'Comprehensive',instructions:'',chapterIds:['sessions','revenue-performance'],theme:'light',showCharts:false}};
for(const id of model.customization.chapterIds){model.chapters[id]={id,n:10,total:{sessions:10,attendance:80,gross_revenue:100000},prior:{sessions:8,attendance:60,gross_revenue:80000},priorYear:{},groups:[],history:[]};model.narratives[id]={generated:true,summary:`Frozen ${id} analysis`,cards:[]};}
// The user's reference example is a visual fixture, not a production finding.
model.narratives.sessions.cards=[{headline:'Studio attendance review',meaning:'Frozen studio evidence.',evidence:'Verification fixture.',action:'',focus:'kpis',lens:'driver',confidence:'low'},
{headline:"Kajol Kanchan's Barre classes account for 55% of September's net attendance decline",meaning:'Attendance fell by 84 visits in this instructor-format segment, against a studio-wide net decline of 152. This concentration warrants investigation into the affected sessions before making schedule or instructor changes.',evidence:'84 lost visits / 152 net lost visits = 55%; gross loss share is not established.',action:'',focus:'cross',lens:'risk',priority:'high',ownerArea:'Studio & Instructor Management',horizon:'Immediate',confidence:'medium',metrics:['attendance'],decisionBrief:{topic:'attendance',kind:'performance_anomaly',diagnosis:'Determine whether the loss came from fewer sessions, weaker attendance per session, timetable changes, or reduced repeat bookings. Current data identifies concentration, not the underlying cause.',affected:'Identify previously regular community members who reduced visits, the weakest session times, and whether similar Barre slots under other instructors experienced the same decline.',opportunity:'Suggested scenario: recovering 50 visits would restore roughly 60% of lost volume, representing ₹35.7K in indicative visit value (50 × ₹714), subject to schedule capacity.',stats:[{label:'Visits lost',value:'−84',basis:'55% of net decline; not share of gross losses.',status:'confirmed'},{label:'Indicative value',value:'₹60K',basis:'84 visits × ₹714; not incremental cash.',status:'estimated'},{label:'Pattern',value:'New reversal',basis:'Not established as persistent.',status:'hypothesis'}],steps:[{label:'Diagnose',detail:'Compare session counts, attendance per session, scheduling changes and member cohorts against August.'},{label:'Recover',detail:'Prioritise personalised outreach to regular attendees whose visit frequency has declined.'},{label:'Optimise',detail:'Review weak slots with instructor management and trial timetable improvements where supported by evidence.'}],review:'Suggested: within 7 days',success:"Track weekly attendance, average fill per session and returning regulars. Suggested target: +50 visits against September's segment baseline, subject to capacity."}}];
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
 const exportReady=review.waitForEvent('download');await review.getByRole('button',{name:'Download',exact:true}).click();
 const exported=await exportReady;const html=await readFile(await exported.path(),'utf8');assert.ok(html.includes('.r3-facets'),'export retains the decision brief stylesheet');assert.ok(html.includes('Recommended Action Plan'),'export retains structured actions');

 assert.equal(await review.locator('[aria-label="Annotation tools"]').isVisible(),true);
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
 const decision=review.locator('.r3-decision');await decision.waitFor();
 assert.equal(await decision.getByRole('heading',{name:'Recommended Action Plan'}).isVisible(),true);
 assert.equal(await decision.locator('.r3-action-plan li').count(),3);
 assert.equal(await decision.locator('.r3-fact').count(),3);
 assert.equal(await decision.locator('.r3-fact').nth(0).locator('strong').innerText(),'−84');
 assert.equal(await decision.getByRole('heading',{name:'Where Is Demand Weakening?'}).isVisible(),true);


 await guest.waitForFunction(()=>document.querySelector('[aria-label="Presentation chapter"]').value==='sessions');
 // Host drawing is shared; guests retain host authority boundaries and add their own notes.
 await review.getByRole('button',{name:'pen',exact:true}).click();
 const box=await review.locator('.presentation-ink').boundingBox();await review.mouse.move(box.x+100,box.y+100);await review.mouse.down();await review.mouse.move(box.x+240,box.y+150);await review.mouse.up();
 await guest.waitForFunction(()=>document.querySelectorAll('.presentation-ink polyline').length===1);
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
 await guest.getByRole('button',{name:'Following host',exact:true}).click();
 await guest.getByRole('button',{name:'Next chapter',exact:true}).click();assert.equal(await guest.getByLabel('Presentation chapter').inputValue(),'revenue-performance');
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
 assert.equal(await separate.getByRole('button',{name:'Add note',exact:true}).isVisible(),true);
 assert.equal(await separate.getByRole('button',{name:'Sound clips',exact:true}).isVisible(),true);
 const navBounds=await separate.getByRole('button',{name:'Next chapter',exact:true}).boundingBox();assert.ok(navBounds.x+navBounds.width<=390,'next chapter stays visible on mobile');
 // Opening a local snapshot still retains its report and tools if database storage fails.
 const local=await hostContext.newPage();
 await local.route('**/api/reports',route=>route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({error:'Storage unavailable for verification.'})}));
 await local.goto(`${url}/report`);
 const draft=randomUUID();await local.evaluate(({draft,model})=>sessionStorage.setItem(`atlas-report-page:${draft}`,JSON.stringify(model)),{draft,model});
 await local.goto(`${url}/report?draft=${draft}`);await local.locator('.report-doc').waitFor();
 assert.equal(await local.getByRole('button',{name:'Add note',exact:true}).isVisible(),true);
 await local.getByRole('button',{name:'Host a session',exact:true}).click();await local.locator('.presentation-panel').getByRole('button',{name:'Host a session',exact:true}).click();
 await local.getByRole('alert').filter({hasText:'Storage unavailable for verification.'}).waitFor();

 await review.reload();await review.locator('[data-note-id]').waitFor();
 assert.equal(await review.locator('[data-note-id] textarea').inputValue(),'Owner confirmed by guest.');
 // Capture the complete card in a tall viewport, so its header and success section are both reviewable.
 const preview=await hostContext.newPage();await preview.setViewportSize({width:1440,height:2000});await preview.goto(`${url}/report?id=${id}`);await preview.locator('.r3-decision').waitFor();
 await preview.addStyleTag({content:'.report-doc .r-topbar{position:relative!important}'});
 await preview.locator('.r3-decision').screenshot({path:'/tmp/atlas-decision-card-desktop.png'});
 await preview.setViewportSize({width:390,height:3000});await preview.locator('.r3-decision').screenshot({path:'/tmp/atlas-decision-card-mobile.png'});
 assert.deepEqual(errors,[]);
 console.log('PASS: new-tab snapshot, full toolkit, host/join, chapter/ink sharing, independent navigation, pause/resume, raised hands, shared notes, isolation, reload and mobile overflow.');
} finally {await browser?.close();await vite.close();http.closeAllConnections();await new Promise(resolve=>http.close(resolve));}
