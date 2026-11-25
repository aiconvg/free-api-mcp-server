#!/usr/bin/env node
// stdio 游客额度耗尽冒烟（#5）：预置本地计数已耗尽 → 调 text_to_speech 应返回
// [QUOTA_EXCEEDED] + resetAt（不再冒充 AUTH_REQUIRED）。
// 用法：node test/smoke.guest-exhaust.js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { writeFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const dir = mkdtempSync(join(tmpdir(), 'mcp-gq-'));
const counterFile = join(dir, 'counter.json');
// 预置：本实例本北京日 text_to_speech 已用 2 次，限额 2 → 下一次即判耗尽（不再触上游）
writeFileSync(counterFile, JSON.stringify({ text_to_speech: 2 }));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['src/index.js'],
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env,
    MCP_TRANSPORT: 'stdio',
    FREE_API_TOKEN: '', // 空 → 回落游客试用
    TRIAL_LICENSE_TOKEN: 'guest-smoke-token', // 有值 → guest 模式置位
    TRIAL_LOCAL_TTS_LIMIT: '2',
    TRIAL_LOCAL_ASR_LIMIT: '15',
    TRIAL_LOCAL_OCR_LIMIT: '15',
    MCP_LOCAL_COUNTER_FILE: counterFile,
    FREE_API_BASE_URL: 'http://127.0.0.1:9', // 上游不可达也无妨：耗尽在本地闸就拦下，不会触上游
  },
});

const client = new Client({ name: 'guest-exhaust-smoke', version: '0.0.1' });
await client.connect(transport);

let failed = 0;
const check = (name, ok, detail = '') => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failed += 1;
};

const r = await client.callTool({ name: 'text_to_speech', arguments: { text: '你好', voice: 'v1' } });
const t = r.content?.[0]?.text || '';
check('游客耗尽 → isError', r.isError === true);
check('游客耗尽 → 文案含 [QUOTA_EXCEEDED]', t.includes('[QUOTA_EXCEEDED]'), t.split('\n')[0]);
check('游客耗尽 → 不含 AUTH_REQUIRED', !t.includes('AUTH_REQUIRED'));
check('游客耗尽 → 含可解析 resetAt 行（+08:00）',
  /(^|\n)resetAt: \d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00(\n|$)/.test(t),
  (t.match(/resetAt: [^\n]+/) || [''])[0]);

process.stdout.write(`\n----- text_to_speech 实际返回 -----\n${t}\n----------------------------------\n`);

await client.close();
process.exit(failed ? 1 : 0);
