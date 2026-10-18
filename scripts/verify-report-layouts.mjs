import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { createServer } from 'vite';
import { chromium } from 'playwright';
import model from './fixtures/report-layout-model.mjs';

const shots = '/tmp/p57-report-layouts';
await mkdir(shots, { recursive: true });
const entry = `import React from 'react';import {createRoot} from 'react-dom/client';
import {ReportBuilder} from '/src/components/report/ReportBuilder';import {ReportDocument} from '/src/components/report/ReportDocument';
import {useReportJob} from '/src/report/job';import {REPORT_TEMPLATES} from '/src/report/templates';import {serialiseReport} from '/src/report/export';
import '/src/design/app.css';import '/src/styles.css';import '/src/design/refinement.css';import '/src/design/report-builder.css';import '/src/design/report-v2.css';import '/src/design/chrome.css';import '/src/design/controls.css';
document.documentElement.dataset.theme='gloss';const model=${JSON.stringify(model)};window.seededModel=model;window.initialEvidence=JSON.stringify({chapters:model.chapters,narratives:model.narratives});
useReportJob.getState().set({studio:model.scope.studio,month:model.scope.month,model,customization:model.customization,status:'idle'});
const root=createRoot(document.getElementById('root'));window.templates=REPORT_TEMPLATES;window.job=useReportJob;
window.showBuilder=()=>root.render(React.createElement('div',{style:{padding:24,maxWidth:1540,margin:'auto'}},React.createElement(ReportBuilder,{version:'fixture'})));
window.showDocument=(id,theme='light')=>{const current={...useReportJob.getState().model,customization:{...useReportJob.getState().model.customization,reportTemplate:id,theme}};window.current=current;root.render(React.createElement(ReportDocument,{model:current,theme}));};
window.exportDocument=()=>serialiseReport(document.querySelector('.report-doc'),window.current);window.showBuilder();`;
const server = await createServer({ logLevel: 'error', server: { host: '127.0.0.1', port: 0 }, plugins: [{
  name: 'report-layout-verification',
  configureServer(server) {server.middlewares.use(async(req,res,next)=>{if(!req.url?.startsWith('/layout-check'))return next();res.setHeader('Content-Type','text/html');res.end(await server.transformIndexHtml(req.url,'<html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module" src="/layout-entry.js"></script></body></html>'));});},
  resolveId(id) { if (id === '/layout-entry.js' || id === '/layout-query.js') return id; },
  load(id) {if(id==='/layout-entry.js')return entry;if(id==='/layout-query.js')return `export async function query(sql){return sql.includes('location')?[{location:'${model.scope.studio}'}]:[{month:'${model.scope.month}'}];}`;},
  transform(code,id){if(id.endsWith('/components/report/ReportBuilder.tsx'))return code.replace('from "../../data/duckdb"','from "/layout-query.js"');},
}] });
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1050}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/api/reports',route=>route.fulfill({json:[]}));await page.route('**/api/reports/admin',route=>route.fulfill({json:{configured:false,unlocked:false}}));
  await page.goto(`${server.resolvedUrls.local[0]}layout-check`);
  await page.getByRole('radio',{name:'Executive report layout',exact:true}).waitFor();
  assert.equal(await page.getByRole('radio',{name:/report layout$/}).count(),10);
  await page.screenshot({path:`${shots}/builder-desktop.png`});
  await page.getByRole('radio',{name:'Editorial report layout',exact:true}).check();
  console.log('Builder rendered');
  const templates=await page.evaluate(()=>window.templates);
  for(const template of templates){
    console.log('Selecting '+template.id);
    await page.getByRole('radio',{name:`${template.name} report layout`,exact:true}).check();
    await page.waitForFunction(id=>window.job.getState().model.customization.reportTemplate===id,template.id);
    assert.equal(await page.locator('.rs-report-preview .report-doc').getAttribute('data-report-template'),template.id);
    assert.equal(await page.evaluate(()=>JSON.stringify({chapters:window.job.getState().model.chapters,narratives:window.job.getState().model.narratives})===window.initialEvidence),true,'layout changes preserve frozen evidence and narrative');
    assert.equal(await page.evaluate(()=>window.job.getState().model.id),undefined,'restyling creates an unsaved variant');
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('atlas-report-preferences')).reportTemplate),template.id);
  }
  // A fresh builder should restore the selected design from its browser preference.
  await page.reload();await page.getByRole('radio',{name:'Panorama report layout'}).waitFor();
  // The seeded report has its own customization, so test persistence separately from saved-report identity.
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('atlas-report-preferences')).reportTemplate),'panorama');
  await page.evaluate(()=>window.job.getState().set({model:null,customization:null}));
  await page.waitForFunction(()=>window.job.getState().customization?.reportTemplate==='panorama');
  assert.equal(await page.getByRole('radio',{name:'Panorama report layout'}).isChecked(),true,'new reports restore the remembered layout');
  await page.evaluate(()=>window.job.getState().set({model:window.seededModel,customization:window.seededModel.customization}));
  await page.getByRole('radio',{name:'Editorial report layout',exact:true}).check();
  const radio=page.getByRole('radio',{name:'Editorial report layout',exact:true});await radio.focus();await page.keyboard.press('ArrowRight');
  await page.waitForFunction(()=>window.job.getState().customization.reportTemplate==='boardroom');
  await page.setViewportSize({width:390,height:844});await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${shots}/builder-mobile.png`});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'builder fits narrow viewport');
  await page.setViewportSize({width:1440,height:1050});
  const signatures=[];
  for(const template of templates){
    await page.evaluate(id=>window.showDocument(id),template.id);await page.waitForFunction(id=>document.querySelector('.report-doc')?.dataset.reportTemplate===id,template.id);
    await page.locator('.leadership-front').waitFor();
    signatures.push(await page.locator('.report-doc').evaluate(el=>{const cover=getComputedStyle(el.querySelector('.leadership-front>header'));const head=getComputedStyle(el.querySelector('.cr-chapter-head'));const chapter=getComputedStyle(el.querySelector('.cr-chapter'));return [cover.backgroundColor,cover.textAlign,cover.display,cover.padding,cover.borderLeftWidth,head.display,head.gridTemplateColumns,chapter.padding,el.style.cssText,getComputedStyle(el).getPropertyValue('--rt-report-width')].join('|');}));
    await page.evaluate(()=>window.scrollTo(0,0));await page.screenshot({path:`${shots}/${template.id}.png`});
    const html=await page.evaluate(()=>window.exportDocument());assert.ok(html.includes('data-report-template="'+template.id+'"'));assert.ok(html.includes('Ten content-preserving document templates'),'template CSS embedded offline');
    assert.ok(html.includes('WRITTEN_REVIEW'),'analysis survives export');
    const offline=await browser.newPage({viewport:{width:1440,height:1050}});
    await offline.route('**/*',route=>route.abort());await offline.setContent(html);
    assert.equal(await offline.locator('.report-doc').getAttribute('data-report-template'),template.id);
    const offlineFont=await offline.locator('.leadership-front h1').evaluate(el=>getComputedStyle(el).fontFamily);
    const readerFont=await page.locator('.leadership-front h1').evaluate(el=>getComputedStyle(el).fontFamily);
    assert.equal(offlineFont,readerFont,'offline typography matches the reviewed report');await offline.close();
    await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`${template.id} document fits mobile`);await page.setViewportSize({width:1440,height:1050});
  }
  assert.equal(new Set(signatures).size,10,'ten structurally distinct designs');
  await page.evaluate(()=>window.showDocument('studio','dark'));await page.waitForFunction(()=>document.querySelector('.report-doc')?.dataset.reportTheme==='dark');
  assert.equal(await page.locator('.cr-report').evaluate(el=>getComputedStyle(el).backgroundColor),'rgb(20, 34, 56)');
  await page.emulateMedia({media:'print'});await page.screenshot({path:`${shots}/print.png`,fullPage:true});
  assert.deepEqual(errors,[],'no browser runtime errors');
  console.log('PASS: ten layouts, builder selection, keyboard, preferences, unchanged evidence, standalone exports, narrow layouts and dark mode. Screenshots: '+shots);
} finally {await browser?.close();await server.close();}
