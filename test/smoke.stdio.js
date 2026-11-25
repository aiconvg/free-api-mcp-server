#!/usr/bin/env node
// stdio 冒烟：默认走错误路径（上游不可达）；SMOKE_LIVE=1 打真实上游。
// 用法：SMOKE_LIVE=1 FREE_API_TOKEN=xx node test/smoke.stdio.js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const live = !!process.env.SMOKE_LIVE;
const token = process.env.FREE_API_TOKEN || 'smoke-test-token';
const baseUrl = live
  ? (process.env.FREE_API_BASE_URL || 'https://www.free-api.aiconvg.xin')
  : 'http://127.0.0.1:9'; // 错误路径专用

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['src/index.js'],
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env,
    MCP_TRANSPORT: 'stdio',
    FREE_API_TOKEN: token,
    FREE_API_BASE_URL: baseUrl,
  },
});

const client = new Client({ name: 'smoke', version: '0.0.1' });
await client.connect(transport);

let failed = 0;
const check = (name, ok, detail = '') => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failed += 1;
};

const tools = await client.listTools();
check('tools/list', Array.isArray(tools.tools) && tools.tools.length > 0,
  `got ${tools.tools?.length}: ${tools.tools?.map((t) => t.name).join(',')}`);
// 工具数只校验非空：以 server 导出的 TOOL_COUNT 为唯一事实源，避免每次增删工具都要改冒烟脚本

const voices = await client.callTool({ name: 'list_voices', arguments: {} });
const isErr = voices.isError === true;
const text = voices.content?.[0]?.text || '';
const expectedFail = !process.env.SMOKE_LIVE;
if (expectedFail) {
  check('list_voices(上游不可达→UPSTREAM_UNAVAILABLE)', isErr && text.includes('UPSTREAM_UNAVAILABLE'),
    text.split('\n')[0]);
} else {
  check('list_voices(真实上游)', !isErr && text.includes('"voices"'), text.split('\n')[0]);
}

const account = await client.callTool({ name: 'get_account', arguments: {} });
const atext = account.content?.[0]?.text || '';
if (expectedFail) {
  check('get_account(上游不可达→UPSTREAM_UNAVAILABLE)', account.isError === true && atext.includes('UPSTREAM_UNAVAILABLE'),
    atext.split('\n')[0]);
} else {
  check('get_account(真实上游)', account.isError !== true && atext.includes('"quota"'), atext.split('\n')[0]);
}

// 参数校验路径（不触上游，本地 zod 直接拒绝）
const badTts = await client.callTool({ name: 'text_to_speech', arguments: { text: 'hi', voice: '' } });
check('text_to_speech(缺 voice→INVALID_PARAM)', badTts.isError === true && (badTts.content?.[0]?.text || '').includes('INVALID_PARAM'),
  (badTts.content?.[0]?.text || '').split('\n')[0]);

const badTtsLen = await client.callTool({ name: 'text_to_speech', arguments: { text: 'x'.repeat(2001), voice: 'v1' } });
check('text_to_speech(超长→INVALID_PARAM)', badTtsLen.isError === true && (badTtsLen.content?.[0]?.text || '').includes('INVALID_PARAM'),
  (badTtsLen.content?.[0]?.text || '').split('\n')[0]);

const badUrl = await client.callTool({ name: 'speech_to_text', arguments: { audioUrl: '/tmp/a.wav' } });
check('speech_to_text(本地路径→INVALID_PARAM)', badUrl.isError === true && (badUrl.content?.[0]?.text || '').includes('INVALID_PARAM'),
  (badUrl.content?.[0]?.text || '').split('\n')[0]);

if (expectedFail) {
  // 上游不可达时计费工具统一走 UPSTREAM_UNAVAILABLE
  const tts = await client.callTool({ name: 'text_to_speech', arguments: { text: '你好', voice: 'v1' } });
  check('text_to_speech(上游不可达→UPSTREAM_UNAVAILABLE)', tts.isError === true && (tts.content?.[0]?.text || '').includes('UPSTREAM_UNAVAILABLE'),
    (tts.content?.[0]?.text || '').split('\n')[0]);
  const ocr = await client.callTool({ name: 'ocr_image', arguments: { imageUrl: 'https://example.com/a.png' } });
  check('ocr_image(上游不可达→UPSTREAM_UNAVAILABLE)', ocr.isError === true && (ocr.content?.[0]?.text || '').includes('UPSTREAM_UNAVAILABLE'),
    (ocr.content?.[0]?.text || '').split('\n')[0]);
  const submit = await client.callTool({ name: 'submit_asr_job', arguments: { audioUrl: 'https://example.com/a.wav' } });
  check('submit_asr_job(上游不可达→UPSTREAM_UNAVAILABLE)', submit.isError === true && (submit.content?.[0]?.text || '').includes('UPSTREAM_UNAVAILABLE'),
    (submit.content?.[0]?.text || '').split('\n')[0]);
}

await client.close();
process.exit(failed ? 1 : 0);
