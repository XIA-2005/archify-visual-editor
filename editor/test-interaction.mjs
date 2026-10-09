#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const original=process.argv[2] || path.resolve('examples/sample.architecture.json');
const chrome=['C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe'].find(p=>fs.existsSync(p));
if(!chrome)throw Error('Chrome/Edge required for UI test');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'archify-editor-ui-'));
const source=JSON.parse(fs.readFileSync(original,'utf8'));
source.meta.output='diagram.html';
fs.writeFileSync(path.join(temp,'candidate.json'),JSON.stringify(source,null,2));
const server=spawn(process.execPath,[fileURLToPath(new URL('./serve.mjs',import.meta.url)),'candidate.json'],{cwd:temp,stdio:['ignore','pipe','pipe'],windowsHide:true});
let stdout='',stderr='';server.stdout.on('data',d=>stdout+=d);server.stderr.on('data',d=>stderr+=d);
const profile=path.join(temp,'chrome-profile');
const browser=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--disable-extensions','--disable-gpu','--remote-allow-origins=*','--remote-debugging-port=0','--user-data-dir='+profile,'about:blank'],{stdio:'ignore',windowsHide:true});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
async function waitFor(fn,ms=15000){const deadline=Date.now()+ms;while(Date.now()<deadline){try{const v=await fn();if(v)return v;}catch{}await sleep(100);}throw Error('Timeout waiting for process: '+stdout+' '+stderr);}
let ws,seq=0;const pending=new Map();
async function call(method,params={}){const id=++seq;return new Promise((resolve,reject)=>{pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));setTimeout(()=>{if(pending.has(id)){pending.delete(id);reject(Error('CDP timeout: '+method))}},12000);});}
async function evaluate(expr){const a=await call('Runtime.evaluate',{expression:expr,returnByValue:true,awaitPromise:true});if(a.error||a.result.exceptionDetails)throw Error('JS eval error '+JSON.stringify(a));return a.result.result.value;}
try{
  const base=await waitFor(()=>stdout.match(/http:\/\/127\.0\.0\.1:\d+\/[0-9a-f]{40}\//)?.[0]);
  const port=await waitFor(()=>fs.existsSync(path.join(profile,'DevToolsActivePort'))?Number(fs.readFileSync(path.join(profile,'DevToolsActivePort'),'utf8').split(/\r?\n/)[0]):false);
  const tab=await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(base)}`,{method:'PUT'})).json();
  ws=new WebSocket(tab.webSocketDebuggerUrl);
  ws.addEventListener('message',e=>{const d=JSON.parse(e.data);if(d.id&&pending.has(d.id)){const v=pending.get(d.id);pending.delete(d.id);v.resolve(d);}});
  await new Promise((resolve,reject)=>{ws.addEventListener('open',resolve,{once:true});ws.addEventListener('error',reject,{once:true})});
  await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-node-id]').length`)===source.components.length);
  await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-rendered-route]').length`)===source.connections.length);
  console.log('PASS: loaded official routes');
  // Property edits avoid a synthetic pointer capture and exercise the same DOM callback used by the inspector.
  assert.equal(await evaluate(`(()=>{let n=document.querySelector('[data-node-id]');n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true}));return document.querySelector('button[data-align="left"]').disabled})()`),true);
  const posResult=await evaluate(`(()=>{let label=[...document.querySelectorAll('aside label')].find(x=>x.textContent.includes('位置 X'));let input=label.querySelector('input');input.value='-200';input.dispatchEvent(new Event('change',{bubbles:true}));return document.querySelectorAll('[data-node-id]').length})()`);
  assert.equal(posResult,source.components.length);
  await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-rendered-route]:not([opacity="0.52"])').length`)===source.connections.length,20000);
  const saved=await evaluate(`(async()=>{document.getElementById('save').click();for(let i=0;i<150;i++){if(document.getElementById('message').classList.contains('ok')&&document.getElementById('message').textContent.includes('JSON'))return true;if(document.getElementById('message').classList.contains('error'))return document.getElementById('message').textContent;await new Promise(r=>setTimeout(r,100));}return 'timeout';})()`);
  assert.equal(saved,true,'save failed: '+saved);
  const modified=JSON.parse(fs.readFileSync(path.join(temp,'candidate.json'),'utf8'));
  assert.ok(modified.components.every(n=>n.pos[0]>=0));
  assert.ok(!modified.meta.viewBox || modified.meta.viewBox[0]>=320);
  console.log('PASS: negative node position corrected; official edges restored and JSON validated/saved');
  await evaluate(`document.getElementById('diagram').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`);
  await evaluate(`(()=>{const a=document.querySelector('[data-node-id="${source.components[0].id}"]');a.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true}));const b=document.querySelector('[data-node-id="${source.components[1].id}"]');b.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true}));return true})()`);
  const enabled=await evaluate(`!document.querySelector('button[data-align="left"]').disabled`);
  assert.ok(enabled);
  const alignResult=await evaluate(`(()=>{document.querySelector('button[data-align="left"]').click();const a=document.querySelector('[data-node-id="${source.components[0].id}"] rect').getAttribute('x');const b=document.querySelector('[data-node-id="${source.components[1].id}"] rect').getAttribute('x');return {a,b}})()`);
  assert.equal(alignResult.a,alignResult.b);
  console.log('PASS: Ctrl multi-selection and left alignment');
  await evaluate(`document.getElementById('undo').click()`);
  await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-rendered-route]:not([opacity="0.52"])').length`)===source.connections.length,12000);
  const manualId=source.connections.find(e=>e.id==='c_start_pack')?.id || source.connections[0].id;
  await evaluate(`(()=>{const e=document.querySelector('[data-edge-id="${manualId}"]');e.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));return true})()`);
  const controls=await evaluate(`(()=>({route:[...document.querySelectorAll('aside label')].some(x=>x.textContent.includes('路由模式')),via:[...document.querySelectorAll('aside label')].some(x=>x.textContent.includes('折点 via'))}))()`);
  assert.ok(controls.route&&controls.via);
  const via='1146,332\n1146,568';
  if(manualId==='c_start_pack'){
    await evaluate(`(()=>{let label=[...document.querySelectorAll('aside label')].find(x=>x.textContent.includes('折点 via'));let el=label.querySelector('textarea');el.value=${JSON.stringify(via)};el.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    await waitFor(async()=>await evaluate(`document.querySelectorAll('[data-bend]').length`)>=2,12000);
    console.log('PASS: hand-authored Archify waypoints and draggable handles');
  }
  // An invalid extreme placement may fail Archify composition checks; the editor
  // must retain the previous geometry as a clearly marked temporary guide.
  await evaluate(`(()=>{const n=document.querySelector('[data-node-id="${source.components[0].id}"]');n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,ctrlKey:true}));return true})()`);
  await evaluate(`(()=>{let label=[...document.querySelectorAll('aside label')].find(x=>x.textContent.includes('位置 X'));let input=label.querySelector('input');input.value='3000';input.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  await sleep(1800);
  const remaining=await evaluate(`document.querySelectorAll('[data-rendered-route]').length`);
  assert.equal(remaining,source.connections.length,'A failed new layout must not erase all old lines');
  console.log('PASS: far-away layout preserves all route guides while recomputing/validating');
  console.log('ALL_UI_TESTS_PASS');
} finally {
  try{ws?.close()}catch{}
  browser.kill();server.kill();await sleep(1000);
  try{fs.rmSync(temp,{recursive:true,force:true,maxRetries:8,retryDelay:200});}catch{}
}
