import { build } from 'esbuild';
import { chromium } from 'playwright';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const result = await build({ stdin: { contents: `import React,{useRef,useState} from 'react';import{createRoot}from'react-dom/client';import{useWorkspaceDrag}from'./src/components/useWorkspaceDrag';import{WorkspaceEditor}from'./src/components/WorkspaceEditor';import{saveWorkspace,workspaceElements}from'./src/state/workspaceLayout';window.saveTestWorkspace=()=>saveWorkspace({active:'test',preferences:{},theme:'gloss',density:'compact',rate:1200});function App(){const root=useRef(null);const[enabled,setEnabled]=useState(false);useWorkspaceDrag(root,'test',true,enabled);return <div className="app"><WorkspaceEditor scope="test" enabled={enabled} onEnabled={setEnabled}/><header className="titlebar"><div className="toolbar-group"/></header><main id="main" ref={root}><section id="one"><h2>First</h2></section><section id="two"><h2>Second</h2><svg width="40" height="40"><circle id="test-circle" cx="20" cy="20" r="15"/></svg></section></main></div>}createRoot(document.getElementById('root')).render(<App/>);`, resolveDir:process.cwd(), loader:'tsx' },bundle:true,write:false,format:'iife',jsx:'automatic',loader:{'.css':'empty'} });
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1440,height:1000}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('http://workspace.test/**',route=>route.fulfill({contentType:'text/html',body:'<div id="root"></div>'}));
  let serverUnlocks = 0;
  await page.route('http://workspace.test/api/reports/admin', async route => {
    const request = route.request();
    if (request.method() === 'POST') {
      assert.equal(request.postDataJSON().passcode, '9818'); serverUnlocks++;
      return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ token: 'verified-test-session', expiresAt: new Date(Date.now() + 3600000).toISOString() }) });
    }
    return route.fulfill({ contentType: 'application/json', body: JSON.stringify({ configured: true, unlocked: request.headers()['x-atlas-admin'] === 'verified-test-session' }) });
  });
  async function load(){await page.goto('http://workspace.test');await page.addStyleTag({content:await readFile('src/design/workspace-layout.css','utf8')+' section{min-height:120px;padding:20px;border:1px solid #ddd}'});await page.addScriptTag({content:result.outputFiles[0].text});await page.getByRole('button',{name:'Unlock workspace editor',exact:true}).waitFor();}
  await load();assert.equal(await page.locator('.workspace-drag-handle:visible').count(),0);
  await page.getByRole('button',{name:'Unlock workspace editor',exact:true}).click();
  await page.getByLabel('Passcode',{exact:true}).fill('1111');await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.getByRole('alert').waitFor();assert.equal(await page.locator('.workspace-editor-panel').count(),0);
  await page.getByLabel('Passcode',{exact:true}).fill('9818');await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.locator('#one > button').waitFor({state:'visible'});
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('atlas-report-admin')).token), 'verified-test-session');
  await page.locator('#one h2').click();
  try {await page.getByLabel('Text content',{exact:true}).waitFor({timeout:5000});}catch(error){console.log('Browser errors:',errors);console.log((await page.locator('.workspace-editor-panel').innerText()));throw error;}
  await page.getByLabel('Text content',{exact:true}).fill('Custom title');await page.getByLabel('All CSS properties (JSON)',{exact:true}).fill('{"color":"rgb(255, 0, 0)","translate":"10px 0"}');await page.getByRole('button',{name:'Apply changes',exact:true}).click();
  assert.equal(await page.locator('#one h2').textContent(),'Custom title');assert.equal(await page.locator('#one h2').evaluate(el=>getComputedStyle(el).color),'rgb(255, 0, 0)');
  await page.evaluate(()=>window.saveTestWorkspace());await load();await page.locator('#one h2').filter({hasText:'Custom title'}).waitFor();assert.equal(await page.locator('.workspace-drag-handle:visible').count(),0);
  await page.getByRole('button',{name:'Unlock workspace editor',exact:true}).click();await page.getByLabel('Passcode',{exact:true}).fill('9818');await page.getByRole('button',{name:'Unlock',exact:true}).click();await page.locator('#one > button').waitFor({state:'visible'});
  await page.locator('#one h2').click();await page.getByRole('button',{name:'Reset selected element',exact:true}).click();assert.equal(await page.locator('#one h2').textContent(),'First');
  await page.locator('#test-circle').click();await page.getByLabel('All CSS properties (JSON)',{exact:true}).fill('{"fill":"rgb(0, 128, 0)"}');await page.getByRole('button',{name:'Apply changes',exact:true}).click();assert.equal(await page.locator('#test-circle').evaluate(el=>getComputedStyle(el).fill),'rgb(0, 128, 0)');
  await page.locator('#one > button').focus();await page.keyboard.press('Alt+ArrowDown');assert.deepEqual(await page.locator('section').evaluateAll(els=>els.map(el=>el.style.order)),['1','0']);
  await page.locator('#one > button').dragTo(page.locator('#two'));assert.deepEqual(await page.locator('section').evaluateAll(els=>els.map(el=>el.style.order)),['0','1']);
  await page.getByRole('button',{name:'Lock workspace editor',exact:true}).click();await page.locator('.workspace-editor-panel').waitFor({state:'detached'});assert.equal(await page.locator('.workspace-drag-handle:visible').count(),0);assert.deepEqual(errors,[]);assert.equal(await page.evaluate(()=>localStorage.getItem('atlas-report-admin')),null);assert.ok(serverUnlocks > 0);
  console.log('PASS: shared server-backed report unlock, passcode gate, text/style editing, save/reload, reset, keyboard and mouse ordering, relock');
} finally {await browser.close();}
