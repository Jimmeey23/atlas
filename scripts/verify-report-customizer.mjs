import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import model from './fixtures/report-layout-model.mjs';
const shots='/tmp/p57-report-customizer';await mkdir(shots,{recursive:true});
const entry=`import React from 'react';import {createRoot} from 'react-dom/client';import {ReportDeck} from '/src/components/report/deck/ReportDeck';
import '/src/design/app.css';import '/src/styles.css';import '/src/design/refinement.css';import '/src/design/report-v2.css';import '/src/design/chrome.css';import '/src/design/controls.css';
document.documentElement.dataset.theme='gloss';const seed=${JSON.stringify(model)};window.seed=seed;const root=createRoot(document.getElementById('root'));window.openReport=(report=seed)=>{root.render(React.createElement(ReportDeck,{key:Math.random(),initial:report}));};window.openReport();`;
const server=await createServer({logLevel:'error',server:{host:'127.0.0.1',port:0},plugins:[{name:'customizer-check',configureServer(server){server.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/customizer-check'))return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/customizer-entry.js"></script></body></html>'));});},resolveId(id){if(id==='/customizer-entry.js')return id;},load(id){if(id==='/customizer-entry.js')return entry;}}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true});const page=await browser.newPage({viewport:{width:1600,height:1000}});const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('Browser error:',e.message);});
 let stored=model,unlocked=false,writes=0;
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;
  if(path==='/api/reports/admin'){
   if(req.method()==='POST'){unlocked=true;return route.fulfill({json:{token:'fixture-session',expiresAt:new Date(Date.now()+3600000).toISOString()}});}
   return route.fulfill({json:{configured:true,unlocked}});
  }
  if(req.method()==='PUT'&&path===`/api/reports/${model.id}`){
   assert.equal(req.headers()['x-atlas-admin'],'fixture-session');stored={...stored,...req.postDataJSON(),editedAt:new Date().toISOString()};writes++;return route.fulfill({json:stored});
  }
  return route.fulfill({json:[]});
 });
 await page.goto(`${server.resolvedUrls.local[0]}customizer-check`);await page.locator('.leadership-front').waitFor();
 await page.getByRole('button',{name:'Customize report',exact:true}).click();const dialog=page.getByRole('dialog',{name:'Layout and content',exact:true});await dialog.waitFor();
 await dialog.getByRole('radio',{name:'Dashboard report layout',exact:true}).check();
 await page.waitForFunction(()=>document.querySelector('.report-doc')?.dataset.reportTemplate==='dashboard');
 assert.equal(writes,0,'draft edits do not write without Save');
 await dialog.getByRole('button',{name:'Content',exact:true}).click();
 await dialog.getByRole('textbox',{name:'Report title',exact:true}).fill('Studio leadership review');
 await dialog.getByRole('combobox',{name:'Edit report chapter'}).selectOption('sessions');
 const summary='Visits increased on unchanged session supply. Validate recurring demand before changing the timetable.';
 await dialog.getByRole('textbox',{name:'Chapter summary',exact:true}).fill(summary);
 await dialog.locator('.report-finding-editor summary').first().click();
 await dialog.getByRole('textbox',{name:'Finding 1: Headline',exact:true}).fill('Validate demand before expanding');
 await dialog.getByRole('checkbox',{name:'Evidence appendix',exact:true}).uncheck();
 await dialog.getByRole('checkbox',{name:'Chapter contents',exact:true}).uncheck();
 await dialog.getByRole('checkbox',{name:'Overview',exact:true}).uncheck();
 assert.equal(await page.locator('.p57-executive-verdict').count(),0,'excluding Overview hides the executive narrative');
 await dialog.getByRole('checkbox',{name:'Overview',exact:true}).check();
 await dialog.getByRole('checkbox',{name:'Recommendations',exact:true}).uncheck();
 assert.equal(await page.locator('.cr-appendix').count(),0);assert.equal(await page.locator('.cr-contents').count(),0);assert.equal(await page.locator('#chapter-recommendations').count(),0);
 await page.screenshot({path:`${shots}/content-desktop.png`});
 await dialog.getByRole('checkbox',{name:'Recommendations',exact:true}).check();
 await dialog.getByRole('button',{name:'Move Recommendations up',exact:true}).click();
 await dialog.getByRole('button',{name:'Style',exact:true}).click();await dialog.getByRole('combobox',{name:'Report paper'}).selectOption('warm');
 await dialog.getByRole('combobox',{name:'Report spacing'}).selectOption('comfortable');
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 assert.equal(await page.getByRole('button',{name:'Customize report',exact:true}).evaluate(el=>el===document.activeElement),true,'focus returns to opener');
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.getByRole('textbox',{name:'Admin passcode'}).fill('fixture');await page.getByRole('button',{name:'Unlock',exact:true}).click();
 await page.getByRole('button',{name:'Save changes',exact:true}).click();await page.waitForFunction(()=>document.querySelector('.deck-message')?.textContent?.includes('Changes saved'));
 assert.equal(writes,1);assert.deepEqual(stored.chapters,model.chapters,'frozen figures unchanged');assert.deepEqual(stored.sourceRecords,model.sourceRecords,'frozen source records unchanged');
 assert.equal(stored.customization.reportTemplate,'dashboard');assert.equal(stored.customization.surface,'warm');assert.equal(stored.customization.showAppendix,false);assert.equal(stored.narratives.sessions.summary,summary);assert.equal(stored.narratives.sessions.cards[0].headline,'Validate demand before expanding');assert.deepEqual(stored.customization.chapterIds,['executive-summary','recommendations','sessions']);
 await page.evaluate(report=>window.openReport(report),stored);await page.locator('.leadership-front h1').filter({hasText:'Studio leadership review'}).waitFor();
 assert.equal(await page.locator('.report-doc').getAttribute('data-report-template'),'dashboard');assert.equal(await page.locator('.cr-appendix').count(),0);
 await page.getByRole('button',{name:'Customize report',exact:true}).click();await page.getByRole('button',{name:'Done',exact:true}).focus();await page.keyboard.press('Tab');
 assert.equal(await page.getByRole('button',{name:'Close report customization',exact:true}).evaluate(el=>el===document.activeElement),true,'dialog traps keyboard focus');
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:`${shots}/layout-mobile.png`});
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'reader and panel fit mobile');
 await page.getByRole('button',{name:'Content',exact:true}).click();await page.screenshot({path:`${shots}/content-mobile.png`});
 assert.ok(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1),'editor fits narrow viewport');
 assert.deepEqual(errors,[]);console.log('PASS: generated-report restyling, content edits, chapter inclusion/order, section visibility, protected save payload, reopen, frozen evidence, focus and mobile. Screenshots: '+shots);
}finally{await browser?.close();await server.close();}
