#!/usr/bin/env node
// 真实端到端自环：list_voices → text_to_speech → (audioUrl) → speech_to_text → get_account
// 用法：FREE_API_TOKEN=<token> node test/e2e.selfloop.js
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const token = process.env.FREE_API_TOKEN;
if (!token) { process.stderr.write('需要 FREE_API_TOKEN\n'); process.exit(2); }

const transport = new StdioClientTransport({
  command: process.execPath,
  args: ['src/index.js'],
  cwd: new URL('..', import.meta.url).pathname,
  env: {
    ...process.env,
    MCP_TRANSPORT: 'stdio',
    FREE_API_TOKEN: token,
    FREE_API_BASE_URL: process.env.FREE_API_BASE_URL || 'https://www.free-api.aiconvg.xin',
  },
});
const client = new Client({ name: 'e2e', version: '0.0.1' });
await client.connect(transport);

let failed = 0;
const check = (name, ok, detail = '') => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failed += 1;
};
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text || '';
  if (r.isError) throw new Error(text.split('\n')[0]);
  return JSON.parse(text);
};

// 1. 音色目录
const voices = await call('list_voices', {});
const voice = voices.voices?.[0]?.voice;
check('list_voices', !!voice, `首个音色: ${voice}`);

// 2. TTS（计费）
const said = '你好，这是 MCP 端到端自环测试。';
const tts = await call('text_to_speech', { text: said, voice });
check('text_to_speech', !!tts.audioUrl && tts.audioUrl.startsWith('http'),
  `audioUrl=${tts.audioUrl?.slice(0, 60)}... duration=${tts.duration}s`);
if (tts.quota?.capability) check('tts.quota 回带', Number.isInteger(tts.quota.capability.used),
  `used=${tts.quota.capability.used} remaining=${tts.quota.capability.remaining}`);

// 3. 用 TTS 产物喂同步 ASR（计费）——自环的核心闭环
// 注意：OSS 引擎对中文数字/同音词有转写差异（如"端"→"SCB段"），只断言首段关键音匹配
const asr = await call('speech_to_text', { audioUrl: tts.audioUrl });
const asrText = (asr.text || '').replace(/[，。！？\s]/g, '');
check('speech_to_text(自环：TTS 产物回喂)', asrText.length >= 4 && asrText.startsWith('你好这是'),
  `识别文本: "${asr.text?.slice(0, 40)}"`);

// 4. 账户核对（不计费）：ASR 用量应已 +1
const acct = await call('get_account', {});
const caps = acct.quota?.caps || {};
check('get_account', !!acct.app?.tier, `tier=${acct.app?.tier} asr used=${caps.asr?.used} tts used=${caps.tts?.used}`);
check('额度对账：tts/asr 各 +1', caps.tts?.used >= 1 && caps.asr?.used >= 1,
  `tts=${caps.tts?.used}/${caps.tts?.limit} asr=${caps.asr?.used}/${caps.asr?.limit}`);

await client.close();
process.stdout.write(failed ? `\n${failed} 项失败\n` : '\n全部 PASS\n');
process.exit(failed ? 1 : 0);
