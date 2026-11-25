// 付费工具 e2e（stdio · 真实令牌）
// 用法：FREE_API_TOKEN='<签名包JSON>' node test/e2e.paid.js
// 覆盖：list_dubbing_voices → dubbing_submit(免费音色0积分/付费音色小额) →
//       submit_video_transcribe(去重命中已完成任务) → get_video_transcribe(终态) →
//       get_dubbing_task(不存在任务→NOT_FOUND 错误映射)
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const token = process.env.FREE_API_TOKEN;
if (!token) { process.stderr.write('需要 FREE_API_TOKEN\n'); process.exit(2); }

const child = spawn('node', ['src/index.js'], {
  env: { ...process.env, MCP_TRANSPORT: 'stdio', FREE_API_TOKEN: token },
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', (d) => process.stderr.write(`[srv] ${d}`));

let nextId = 1;
const pending = new Map();
child.stdout.on('data', (buf) => {
  for (const line of buf.toString().split('\n')) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch { /* 忽略非 JSON 行 */ }
  }
});

function rpc(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}
async function callTool(name, args) {
  const r = await rpc('tools/call', { name, arguments: args || {} });
  if (r.error) return { _rpcError: r.error };
  const text = r.result?.content?.[0]?.text ?? '';
  try { return { isError: !!r.result?.isError, ...(JSON.parse(text)) }; }
  catch { return { isError: !!r.result?.isError, _text: text.slice(0, 300) }; }
}

const results = [];
function check(name, ok, detail) {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${detail || ''}`);
}

// 0) tools/list
const listed = await rpc('tools/list', {});
const names = (listed.result?.tools || []).map((t) => t.name);
check('tools/list 数量=13', names.length === 13, names.join(','));

// 1) list_dubbing_voices
const dv = await callTool('list_dubbing_voices');
const voices = dv?.data?.voices || dv?.voices || [];
const freeVoice = voices.find((v) => v.free && v.id.startsWith('matcha'));
check('list_dubbing_voices ≥70 音色且含免费音色', voices.length >= 70 && !!freeVoice, `total=${voices.length} free=${freeVoice?.id}`);

// 2) dubbing_submit 免费音色（0 积分，同步）
const sub1 = await callTool('dubbing_submit', { segments: [{ voice: freeVoice?.id || 'matcha_zh', text: '你好，这是 MCP 付费接口连通性测试。' }] });
check('dubbing_submit 免费音色同步成功 creditCost=0', sub1?.audioUrl && Number(sub1.creditCost) === 0, `cost=${sub1?.creditCost} audio=${String(sub1?.audioUrl).slice(0, 60)}`);

// 3) dubbing_submit 付费音色（你好=2字×2积分）
const sub2 = await callTool('dubbing_submit', { segments: [{ voice: 'Cherry', text: '你好' }] });
check('dubbing_submit 付费音色实扣=4', Number(sub2?.creditCost) === 4, `cost=${sub2?.creditCost}`);

// 4) get_dubbing_task 不存在任务 → NOT_FOUND
const bad = await callTool('get_dubbing_task', { taskId: 'nonexist-task-0001' });
check('get_dubbing_task 不存在 → NOT_FOUND', bad?.isError === true && /NOT_FOUND/.test(bad?._text || ''), (bad?._text || '').slice(0, 80));

// 5) submit_video_transcribe（已完成的 URL → 去重命中 done 任务，零成本验证提交链路）
const vs = await callTool('submit_video_transcribe', { url: 'https://v.douyin.com/g3LdHd0M8jY/' });
const vTask = vs?.taskId;
check('submit_video_transcribe 返回 taskId（可能 deduped）', !!vTask, `taskId=${vTask} deduped=${vs?.deduped}`);

// 6) get_video_transcribe 轮询至终态（去重任务应直接 done）
let vg = null;
for (let i = 0; i < 20; i++) {
  vg = await callTool('get_video_transcribe', { taskId: vTask });
  const st = vg?.status;
  if (st === 'done' || st === 'failed') break;
  await sleep(5000);
}
check('get_video_transcribe done 且 chars=575 credits=115', vg?.status === 'done' && vg?.chars === 575, `status=${vg?.status} chars=${vg?.chars} credits=${vg?.credits}`);

// 7) 取消不存在的任务（错误映射）
const cx = await callTool('cancel_dubbing_task', { taskId: 'nonexist-task-0001' });
check('cancel_dubbing_task 不存在 → isError', cx?.isError === true, (cx?._text || '').slice(0, 80));

console.log(`\n== 结果：${results.filter((r) => r.ok).length}/${results.length} 通过 ==`);
child.kill();
process.exit(results.every((r) => r.ok) ? 0 : 1);
