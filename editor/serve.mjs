#!/usr/bin/env node
// Optional, localhost-only visual editor for existing Archify architecture candidates.
// The canonical renderer, candidate and delivery evidence stay under Archify's control.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { renderArchifyRoutes } from './route-preview.mjs';

const root = fs.realpathSync.native(process.cwd());
const editorDir = path.dirname(fileURLToPath(import.meta.url));
const cli = process.env.ARCHIFY_CLI
  ? path.resolve(process.env.ARCHIFY_CLI)
  : path.resolve(editorDir, '../bin/archify.mjs');
if (!fs.existsSync(cli)) {
  console.error('Cannot locate Archify. Set ARCHIFY_CLI to the full path to Archify/bin/archify.mjs.');
  process.exit(1);
}
const requested = process.argv[2];
if (!requested || process.argv.includes('--help')) {
  console.log('用法: node <archify>/editor/serve.mjs <candidate.json>（在项目根目录使用 Bash 执行）');
  process.exit(requested ? 0 : 1);
}
const input = fs.realpathSync.native(path.resolve(root, requested));
const inside = (p) => p === root || p.startsWith(root + path.sep);
if (!inside(input) || !fs.statSync(input, { throwIfNoEntry: false })?.isFile()) {
  console.error('候选文件必须位于当前项目目录内，且已存在。');
  process.exit(1);
}
const canonical = JSON.parse(fs.readFileSync(input, 'utf8'));
if (canonical.diagram_type !== 'architecture' || canonical.schema_version !== 1) {
  console.error('可视化编辑器目前仅支持 architecture / schema_version 1。');
  process.exit(1);
}
const output = path.resolve(root, canonical.meta.output);
const outputParent = fs.realpathSync.native(path.dirname(output));
const existingOutput = fs.existsSync(output) ? fs.realpathSync.native(output) : output;
if (!inside(output) || !inside(outputParent) || !inside(existingOutput)
  || !output.toLowerCase().endsWith('.html')) {
  console.error('候选图的 meta.output 不在当前项目目录内。');
  process.exit(1);
}
const originalMeta = { output: canonical.meta.output, repository: canonical.meta.repository };
const token = randomBytes(20).toString('hex');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const json = (res, code, body) => respond(res, code, JSON.stringify(body), 'application/json; charset=utf-8');
function respond(res, code, body, mime) {
  res.writeHead(code, {
    'Content-Type': mime,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Cross-Origin-Resource-Policy': 'same-origin',
  });
  res.end(body);
}
const stamp = () => new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14) + '-' + randomBytes(3).toString('hex');
function runCli(args) {
  const result = spawnSync(process.execPath, [cli, ...args], {
    cwd: root, encoding: 'utf8', timeout: 120000, maxBuffer: 5_000_000,
    windowsHide: true,
  });
  let parsed;
  try { parsed = JSON.parse(result.stdout?.trim() || '{}'); } catch { parsed = {}; }
  return {
    // 'validate' emits {ok:true} without 'status'; 'finalize' emits both.
    ok: result.status === 0 && parsed.ok === true && (!parsed.status || parsed.status === 'pass'),
    receipt: parsed,
    message: (parsed.diagnostics || []).map((v) => v.message).slice(0, 6).join('；')
      || result.error?.message || result.stderr?.slice(-700) || '校验未通过',
  };
}
function validCandidateMetadata(next) {
  return next && Array.isArray(next.components) && Array.isArray(next.connections)
    && next.diagram_type === 'architecture' && next.schema_version === 1
    && next.meta?.output === originalMeta.output
    && JSON.stringify(next.meta?.repository) === JSON.stringify(originalMeta.repository);
}
async function onRoutePreview(req, res) {
  try {
    let raw = '';
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 2_000_000) return json(res, 413, {ok:false,message:'预览输入过大'});
    }
    const candidate = JSON.parse(raw);
    if (!validCandidateMetadata(candidate)) {
      return json(res, 400, {ok:false,message:'预览输入格式或元数据不合法'});
    }
    const edges = renderArchifyRoutes({
      candidate, cli, cwd: root, repositoryBacked: Boolean(candidate.meta.repository),
    });
    json(res, 200, {ok:true,source:'archify-render',edges});
  } catch (error) {
    json(res, 422, {ok:false,message:error.message});
  }
}
let busy = false;
async function onSave(req, res) {
  if (busy) return json(res, 423, { ok: false, message: '正在生成中，请勿重复保存。' });
  busy = true;
  let temporary;
  try {
    let body = '';
    for await (const part of req) {
      body += part;
      if (body.length > 2_000_000) throw new Error('JSON 超出 2 MB 限制');
    }
    const request = JSON.parse(body);
    const currentBytes = fs.readFileSync(input);
    if (hash(currentBytes) !== request.expectedHash) {
      return json(res, 409, { ok: false, message: 'candidate.json 已被其他程序更改，请刷新编辑器后重试，或先导出当前修改。' });
    }
    const next = request.candidate;
    if (!validCandidateMetadata(next)) {
      return json(res, 400, { ok: false, message: '架构类型、输出路径或仓库标识不允许变更。' });
    }
    if (JSON.stringify(next).length > 1_000_000) {
      return json(res, 413, { ok: false, message: '图内容超出 1 MB 限制。' });
    }
    temporary = path.join(path.dirname(input), `candidate.editor-${stamp()}.json`);
    fs.writeFileSync(temporary, JSON.stringify(next, null, 2) + '\n', { flag: 'wx' });
    // Gate content and composition BEFORE changing the user's canonical file.
    const validation = runCli(['validate', 'architecture', temporary, '--quality', 'showcase', '--json']);
    if (!validation.ok) {
      return json(res, 422, { ok: false, stage: 'validate', message: validation.message,
        note: '原始 candidate.json 和正式 HTML 未更改；可调整位置后重试，或导出 JSON 草稿。' });
    }
    if (hash(fs.readFileSync(input)) !== request.expectedHash) {
      return json(res, 409, { ok: false, message: '在校验期间文件已变化，请先刷新或导出草稿。' });
    }
    const backup = path.join(path.dirname(input), `candidate.backup-${stamp()}.json`);
    fs.copyFileSync(input, backup, fs.constants.COPYFILE_EXCL);
    fs.renameSync(temporary, input);
    temporary = undefined;
    const latestHash = hash(fs.readFileSync(input));
    const receiptFolder = path.join(path.dirname(input), `editor-review-${stamp()}`);
    const finalization = runCli(['finalize', 'architecture', input, output,
      '--quality', 'showcase', '--out-dir', receiptFolder, '--json']);
    if (!finalization.ok) {
      return json(res, 500, { ok: false, stage: 'finalize', saved: true, expectedHash: latestHash,
        message: 'JSON 已保存，但 HTML 完整交付检查未通过：' + finalization.message,
        backup, note: '已保留保存前的 JSON 备份。请根据检查报告修复，勿将旧 HTML 当作通过验证的新版本。' });
    }
    json(res, 200, { ok: true, expectedHash: latestHash, backup,
      message: 'JSON 已保存；Archify 的 validate、deliver、check、browser-check 全部通过。' });
  } catch (error) {
    json(res, 500, { ok: false, message: error.message });
  } finally {
    if (temporary) try { fs.unlinkSync(temporary); } catch {}
    busy = false;
  }
}
const html = fs.readFileSync(path.join(editorDir, 'editor.html'), 'utf8');
const server = http.createServer((req, res) => {
  const base = `/${token}`;
  const route = req.url?.split('?')[0];
  const host = `127.0.0.1:${server.address().port}`;
  if (req.headers.host !== host || !route?.startsWith(base)) {
    return json(res, 404, { ok: false, message: 'Not found' });
  }
  if (req.method === 'GET' && (route === base || route === base + '/')) {
    return respond(res, 200, html, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && route === base + '/api/spec') {
    const raw = fs.readFileSync(input);
    return json(res, 200, { candidate: JSON.parse(raw), expectedHash: hash(raw),
      target: output, input });
  }
  if (req.method === 'GET' && route === base + '/original') {
    if (!fs.existsSync(output)) return respond(res, 404, 'Original HTML not found', 'text/plain');
    return respond(res, 200, fs.readFileSync(output), 'text/html; charset=utf-8');
  }
  if (req.method === 'POST' && route === base + '/api/save') {
    if (req.headers.origin !== `http://${host}` || req.headers['x-archify-editor'] !== '1'
      || !req.headers['content-type']?.startsWith('application/json')) {
      return json(res, 403, { ok: false, message: 'Unauthorized origin' });
    }
    return void onSave(req, res);
  }
  if (req.method === 'POST' && route === base + '/api/routes') {
    if (req.headers.origin !== 'http://' + host || req.headers['x-archify-editor'] !== '1'
      || !req.headers['content-type']?.startsWith('application/json')) {
      return json(res, 403, { ok: false, message: 'Unauthorized origin' });
    }
    return void onRoutePreview(req, res);
  }
  json(res, 404, { ok: false, message: 'Not found' });
});
server.listen(0, '127.0.0.1', () => {
  console.log('\nArchify 可视化编辑器已启动（仅本机访问）：');
  console.log(`http://127.0.0.1:${server.address().port}/${token}/`);
  console.log('项目：' + input);
  console.log('在浏览器打开上面的地址。Ctrl+C 结束编辑器。');
});
