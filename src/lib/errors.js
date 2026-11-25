import { UpstreamError } from './apiClient.js';

// MCP 的 isError 内容只放文本；把上游错误码翻译成 Agent 可直接执行的下一步动作。
const HINTS = {
  UNAUTHORIZED: '令牌无效或缺失。请到 https://www.open-api.aiconvg.xin 注册获取免费许可证，并在客户端配置 Authorization: Bearer <token> 后重试。',
  VOICE_NOT_ALLOWED: '音色不在开放白名单。先调用 list_voices 查看可用音色，再从中选择 voice 参数。',
  INVALID_PARAM: '入参不合法。请检查必填字段与取值范围（TTS 文本 ≤300 字符、speed 0.5–2.0）。不要使用本地文件路径，音频/图片必须是公网可访问 URL。',
  TEXT_TOO_LONG: '文本超过 300 字符上限（付费音色硬限，2026-11-09 由 2000 收敛）。请分段合成后拼接播放。',
  PAYLOAD_TOO_LARGE: '资源超过上限（同步 ASR/OCR ≤8MB；异步 submit_asr_job ≤50MB）。请压缩后重新上传，或改用更短的音频（同步 ASR 还要求 ≤60 秒，长音频改用 submit_asr_job）。',
  RATE_LIMITED: '触发限速。按 retryAfter 秒数等待后重试。',
  QUOTA_EXCEEDED: '当日额度用尽。额度按能力维度（tts/asr/ocr）与日总量分别封顶，以 quota 中被撑爆的维度为准；本会话请停止计费调用，额度将于 resetAt（北京时间 08:00）恢复。补充方案：① POST /v1/quota-pack 购买当日额度包（1,000 积分 = +50 次，tts/asr/ocr 通用，每日最多 2 包，当日有效）——标准引擎立即恢复，无需换引擎；② 付费引擎（premium）按积分计费、不占日额度——登录 https://www.open-api.aiconvg.xin 顶部「充值」购买积分后，请求中传 engine:"premium"（仅付费档可用）；③ 等待次日重置后继续使用标准引擎。',
  UPSTREAM_OVERLOAD: '上游过载。可稍后按 retryAfter 重试（不计费工具可重试，计费工具由用户决定）。',
  UPSTREAM_UNAVAILABLE: '上游暂不可用。可稍后重试（不计费工具可重试，计费工具由用户决定）。',
  FEATURE_DISABLED: '该能力需要付费档位。免费/试用额度仅限标准免费引擎，不能调用 premium。',
  NOT_FOUND: '任务或产物不存在（异步任务结果保留 24 小时）。请核对 taskId。',
  APP_DISABLED: '应用已被禁用，请联系平台。',
  INSUFFICIENT_CREDITS: '积分余额不足（付费能力按积分计费：多角色配音按音色单价/字、视频转写每 5 字 1 积分）。请登录 https://www.open-api.aiconvg.xin 顶部「充值」购买积分（1 元起，10 元赠 5%、50 元赠 10%）后重试；当前余额可用 get_account 查看。提示：先用 list_dubbing_voices 选免费开源音色（0 积分）可零成本完成配音。',
};

export function errorToMcpContent(err) {
  if (err instanceof UpstreamError) {
    const lines = [`[${err.code}] ${err.message}`, '', HINTS[err.code] || ''].filter(Boolean);
    if (err.retryAfter != null) lines.push(`retryAfter: ${err.retryAfter}s`);
    if (err.resetAt) lines.push(`resetAt: ${err.resetAt}`);
    if (err.quota) lines.push(`quota: ${JSON.stringify(err.quota)}`);
    if (err.requestId) lines.push(`requestId: ${err.requestId}`);
    return { isError: true, content: [{ type: 'text', text: lines.join('\n') }] };
  }
  if (err?.code === 'AUTH_REQUIRED') {
    return {
      isError: true,
      content: [{
        type: 'text',
        text: `[AUTH_REQUIRED] ${err.message}\n注册入口：https://www.open-api.aiconvg.xin\n配置示例（客户端 MCP 配置）：\n"env": { "FREE_API_TOKEN": "<你的令牌>" }`,
      }],
    };
  }
  return {
    isError: true,
    content: [{ type: 'text', text: `[INTERNAL_ERROR] ${err?.message || String(err)}` }],
  };
}
