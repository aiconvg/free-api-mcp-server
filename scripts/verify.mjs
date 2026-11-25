#!/usr/bin/env node
// verify.mjs —— 统一验收入口（研发官维护；单仓自包含，配置见同目录 verify.config.json）
//
//   npm run verify         静态检查 → 单测；不跑真实上游/联网用例
//   npm run verify:live    显式加 --live 才跑真实上游/端到端（可能产生费用或写数据）
//
// 结果落 <repo>/verify-results/<时间戳>.json 与 latest.json（已在 .gitignore）。
// 退出码：有失败步骤 exit 1（verify.config.json 里 knownFailures 登记的除外）。
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const OUT_DIR = path.join(ROOT, 'verify-results');
const LIVE = process.argv.includes('--live');
const CFG = JSON.parse(fs.readFileSync(path.join(HERE, 'verify.config.json'), 'utf8'));

const steps = [];
if (!LIVE && CFG.syntax) steps.push({ name: 'syntax', type: 'syntax', ...CFG.syntax });
for (const s of (LIVE ? CFG.live : CFG.verify) || []) steps.push({ name: s.name, type: 'cmd', cmd: s.cmd, env: s.env });

function walk(dir, exts, out = []) {
  let entries = [];
  try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === 'data' || e.name === '.git') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, exts, out);
    else if (e.isFile() && exts.includes(path.extname(e.name).toLowerCase())) out.push(full);
  }
  return out;
}

function runStep(step) {
  const started = Date.now();
  if (step.type === 'syntax') {
    const files = step.dirs.flatMap((d) => walk(path.join(ROOT, d), step.exts));
    const bad = [];
    for (const f of files) {
      const r = spawnSync(process.execPath, ['--check', f], { encoding: 'utf8' });
      if (r.status !== 0) bad.push({ file: path.relative(ROOT, f), error: (r.stderr || '').trim().split('\n').slice(0, 4).join('\n') });
    }
    return { ok: bad.length === 0, ms: Date.now() - started, checked: files.length, failed: bad };
  }
  const r = spawnSync(step.cmd, { shell: true, cwd: ROOT, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, env: { ...process.env, ...(step.env || {}) } });
  return {
    ok: r.status === 0,
    code: r.status,
    ms: Date.now() - started,
    tail: ((r.stdout || '') + (r.stderr || '')).trim().split('\n').slice(-25).join('\n'),
  };
}

const known = new Set((CFG.knownFailures || []).map((k) => k.name));
const report = { at: new Date().toISOString(), live: LIVE, cwd: ROOT, steps: [] };
let failed = 0;
let knownFailed = 0;

console.log(`verify${LIVE ? ':live' : ''} @ ${path.basename(ROOT)}  (${steps.length} 步)`);
for (const step of steps) {
  process.stdout.write(`→ ${step.name} ... `);
  const res = runStep(step);
  const entry = { name: step.name, ...res };
  report.steps.push(entry);
  if (res.ok) console.log(`ok (${res.ms}ms)${res.checked ? `，${res.checked} 文件` : ''}`);
  else if (known.has(step.name)) { console.log(`⚠ 已知失败 (${res.ms}ms)`); knownFailed++; }
  else { console.log(`FAIL (${res.ms}ms)`); failed++; }
}

report.summary = { total: steps.length, failed, knownFailed, ok: failed === 0 };
if (report.summary.ok) {
  console.log(`✅ 全部通过${knownFailed ? `（${knownFailed} 项已知失败，见配置）` : ''}`);
}

try {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  fs.writeFileSync(path.join(OUT_DIR, `${stamp}.json`), JSON.stringify(report, null, 2));
  fs.writeFileSync(path.join(OUT_DIR, 'latest.json'), JSON.stringify(report, null, 2));
  console.log(`结果：${path.relative(ROOT, OUT_DIR)}/latest.json`);
} catch (e) {
  console.error(`结果写入失败：${e.message}`);
}

for (const s of report.steps.filter((x) => !x.ok && !known.has(x.name))) {
  console.error(`\n── ${s.name} 输出（尾部）──\n${s.tail || JSON.stringify(s.failed || [], null, 2)}`);
}
process.exit(failed ? 1 : 0);
