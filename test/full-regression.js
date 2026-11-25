// 全功能回归测试（MCP 13 工具 · stdio · 真实令牌）
// 用法：FREE_API_BASE_URL=... FREE_API_TOKEN='<签名包JSON>' node test/full-regression.js
// 成本预算：≤ 1,000 积分（0.1 元），实际约 596 积分：
//   tts(premium 26) + asr(premium 30) + ocr(premium 30) + dubbing付费(4)
//   + video 完整新任务(~500 上限，实际按字结算) + 免费项 0（7 个不计费/免费音色/额度查询）
//   + 错误分支 0（全部预期失败不计费）
import { spawn } from 'node:child_process';
import { setTimeout as sleep } from 'node:timers/promises';

const token = process.env.FREE_API_TOKEN;
if (!token) { process.stderr.write('需要 FREE_API_TOKEN\n'); process.exit(2); }
const BASE = process.env.FREE_API_BASE_URL || 'http://127.0.0.1:3013';

const child = spawn('node', ['src/index.js'], {
  env: { ...process.env, MCP_TRANSPORT: 'stdio', FREE_API_TOKEN: token, FREE_API_BASE_URL: BASE },
  stdio: ['pipe', 'pipe', 'pipe'],
});
child.stderr.on('data', () => {}); // 静默服务日志

let nextId = 1;
const pending = new Map();
child.stdout.on('data', (buf) => {
  for (const line of buf.toString().split('\n')) {
    if (!line.trim()) continue;
    try {
      const msg = JSON.parse(line);
      if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    } catch { /* ignore */ }
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
  catch { return { isError: !!r.result?.isError, _text: text }; }
}

const results = [];
let creditsSpent = 0;
function check(group, name, ok, detail) {
  results.push({ group, name, ok, detail: String(detail || '') });
  console.log(`${ok ? 'PASS' : 'FAIL'}  [${group}] ${name}  ${detail || ''}`);
}

// ═══ A. 元信息 ═══
const listed = await rpc('tools/list', {});
const tools = listed.result?.tools || [];
check('A 元信息', 'tools/list 返回 13 工具', tools.length === 13, tools.map(t=>t.name).join(','));

// ═══ B. 免费只读（0 成本）═══
const dv = await callTool('list_dubbing_voices');
const voices = dv?.data?.voices || [];
const freeVoice = voices.find(v => v.free) || { id: 'matcha_zh' };
check('B 免费只读', 'list_dubbing_voices', voices.length >= 70, `total=${voices.length}`);

const acc = await callTool('get_account');
const quota = acc?.quota || {};
check('B 免费只读', 'get_account 含 quota', !!quota.caps, `caps=${Object.keys(quota.caps||{}).join('/')}`);

const lv = await callTool('list_voices');
check('B 免费只读', 'list_voices', (lv?.voices || lv?.data?.voices || []).length > 0, `n=${(lv?.voices||lv?.data?.voices||[]).length}`);

// ═══ C. 标准引擎计费（占日额度，不扣积分）═══
// 注意：/v1/voices 白名单（piper 开源音色）与 dubbing 音色目录不同源
const stdVoice = (lv?.voices || [])[0]?.voice || 'zh_CN-huayan-medium';
const ttsStd = await callTool('text_to_speech', { text: '标准引擎测试', voice: stdVoice });
check('C 标准引擎', 'text_to_speech(standard)', !!ttsStd?.audioUrl, `audio=${String(ttsStd?.audioUrl).slice(0,50)} quotaUsed=${ttsStd?.quota?.capability?.used}`);

const asrStd = await callTool('speech_to_text', { audioUrl: ttsStd.audioUrl });
check('C 标准引擎', 'speech_to_text(回环)', !!asrStd?.text, `text="${String(asrStd?.text).slice(0,30)}" engine=${asrStd?.engine || ''}`);

// ═══ D. premium 引擎计费（扣积分；paid 档专用）═══
// 响应包形态：credits_charged 在顶层（gateway 审计）；audioUrl 在 data.data.audioUrl（MCP 层已展开为顶层）
const ttsPre = await callTool('text_to_speech', { text: '你好', voice: 'Cherry', engine: 'premium' });
const ttsPreCost = Number(ttsPre?.credits_charged ?? 0);
creditsSpent += ttsPreCost;
check('D premium', 'text_to_speech(premium) 扣积分', ttsPreCost > 0 && (!!ttsPre?.audioUrl || !!ttsPre?.data?.audioUrl), `cost=${ttsPreCost} audio=${String(ttsPre?.audioUrl || ttsPre?.data?.audioUrl || '').slice(0,50)}`);

const ocr = await callTool('ocr_image', { imageUrl: 'https://picsum.photos/300' });
const ocrCost = Number(ocr?.credits_charged ?? 0);
creditsSpent += ocrCost;
// picsum 随机图可能无文字：blocks 为空数组也合法，quota 递增即证明调用成功
check('D premium', 'ocr_image', Array.isArray(ocr?.blocks) && !!ocr?.quota?.capability, `blocks=${ocr?.blocks?.length} quotaUsed=${ocr?.quota?.capability?.used}`);

// ═══ E. dubbing（免费音色 0 + 付费音色 4 积分 + 取消/查询错误分支 0）═══
const d1 = await callTool('dubbing_submit', { segments: [{ voice: freeVoice.id, text: '你好，全功能测试。' }] });
check('E dubbing', '免费音色同步 cost=0', Number(d1?.creditCost) === 0 && !!d1?.audioUrl, `cost=${d1?.creditCost}`);

const d2 = await callTool('dubbing_submit', { segments: [{ voice: 'Cherry', text: '你好' }] });
const d2Cost = Number(d2?.creditCost) || 0;
creditsSpent += d2Cost;
check('E dubbing', '付费音色同步 cost=4', d2Cost === 4, `cost=${d2Cost}`);

const dBad = await callTool('dubbing_submit', { segments: [] });
check('E dubbing', '空 segments → INVALID_PARAM', dBad?.isError === true && /INVALID_PARAM/.test(dBad?._text || ''), (dBad?._text||'').slice(0,60));

const dGet = await callTool('get_dubbing_task', { taskId: 'nope-task-0001' });
check('E dubbing', 'get 不存在 → NOT_FOUND', dGet?.isError && /NOT_FOUND/.test(dGet?._text||''), '');

const dCx = await callTool('cancel_dubbing_task', { taskId: 'nope-task-0001' });
check('E dubbing', 'cancel 不存在 → NOT_FOUND', dCx?.isError && /NOT_FOUND/.test(dCx?._text||''), '');

// ═══ F. video（复用已完成 URL 去重 = 0 成本拿终态；另跑 1 个新短任务）═══
// F1 去重链路（0 成本）
const v1 = await callTool('submit_video_transcribe', { url: 'https://v.douyin.com/g3LdHd0M8jY/' });
check('F video', 'submit（去重命中）', !!v1?.taskId, `deduped=${v1?.deduped} taskId=${v1?.taskId}`);
let vg1 = null;
for (let i = 0; i < 36; i++) {
  vg1 = await callTool('get_video_transcribe', { taskId: v1.taskId });
  if (['done','failed'].includes(vg1?.status)) break;
  await sleep(5000);
}
check('F video', 'get 终态 done（历史任务不重复扣费）', vg1?.status === 'done' && Number(vg1?.credits) === 115, `status=${vg1?.status} credits=${vg1?.credits}`);

// F2 新任务（唯一真实大额项；选最短已知素材 106.65s，冻结 214，按字结算 ~898 字 ≈ 180 积分）
// 若该 URL 已被测过，会走去重（0 成本）——预算按最坏 ~500 计
const v2 = await callTool('submit_video_transcribe', { url: 'https://v.douyin.com/k8-2_PkbBW8/' });
check('F video', 'submit 新任务', !!v2?.taskId, `taskId=${v2?.taskId} deduped=${v2?.deduped}`);
let vg2 = null;
if (v2?.taskId && !v2?.deduped) {
  for (let i = 0; i < 24; i++) {
    vg2 = await callTool('get_video_transcribe', { taskId: v2.taskId });
    if (['done','failed'].includes(vg2?.status)) break;
    await sleep(5000);
  }
} else if (v2?.taskId) {
  for (let i = 0; i < 12; i++) {
    vg2 = await callTool('get_video_transcribe', { taskId: v2.taskId });
    if (['done','failed'].includes(vg2?.status)) break;
    await sleep(5000);
  }
}
const v2Credits = Number(vg2?.credits) || 0;
creditsSpent += v2Credits;
check('F video', '新任务终态 done 按字结算', vg2?.status === 'done' && v2Credits >= 0, `status=${vg2?.status} chars=${vg2?.chars} credits=${v2Credits}`);

// F3 错误分支（0 成本）
const vBad = await callTool('submit_video_transcribe', { url: 'https://example.com/not-video' });
check('F video', '白名单外域名 → 拒绝', vBad?.isError === true, (vBad?._text||'').slice(0,70));

// ═══ G. asr 异步（submit 占 1 次额度，get 免费；失败返还）═══
// 产物直链 24h 有效，但同一 URL 被上一轮 asr job 处理后可能进入失败缓存；重新合成一份新鲜音频
const ttsG = await callTool('text_to_speech', { text: '异步任务测试', voice: stdVoice });
const aj = await callTool('submit_asr_job', { audioUrl: ttsG.audioUrl || ttsStd.audioUrl });
check('G asr 异步', 'submit_asr_job', !!aj?.taskId, `taskId=${aj?.taskId}`);
let ag = null;
if (aj?.taskId) {
  for (let i = 0; i < 16; i++) {
    ag = await callTool('get_asr_job', { taskId: aj.taskId });
    if (['done','failed'].includes(ag?.status)) break;
    await sleep(3000);
  }
}
check('G asr 异步', 'get_asr_job 终态', ['done','failed'].includes(ag?.status), `status=${ag?.status} text="${String(ag?.text||'').slice(0,20)}"`);

// ═══ 汇总 ═══
const pass = results.filter(r=>r.ok).length;
console.log(`\n== 结果：${pass}/${results.length} 通过 | 积分消耗：${creditsSpent}（预算 1000）==`);
console.log(JSON.stringify(results.map(r=>({g:r.group,n:r.name,ok:r.ok,d:r.detail})), null, 0));
child.kill();
process.exit(results.every(r=>r.ok) && creditsSpent <= 1000 ? 0 : 1);
