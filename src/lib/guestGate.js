import { logger } from '../context.js';

// 游客闸门（guest gate）——定义「游客」可用的工具白名单与每日额度，唯一事实源。
//
// 游客 = 托管 HTTP 无令牌试用（requestContext.trial.active）
//      或 stdio 游客模式（context.isGuestMode()，index.js 在无 FREE_API_TOKEN 时回落试用令牌置位）。
//
// 目的：堵住「用试用许可证令牌去调高级 / 异步能力」的旁路——
//   - submit_asr_job（长音频异步，可绕开同步 ≤60s / ≤8MB 的限次口径）
//   - dubbing_*（多角色配音，约 133 积分/次）
//   - video_*（视频转写，约 148 积分/次，且占渲染算力）
// 这些游客一律拒；游客只放：list_voices / get_account（免费只读）+ 3 个可试能力。
// 真正可靠的全局限额仍压在上游 02 的游客专用令牌（日额度 + 限流）。

const SIGNUP_URL = process.env.TRIAL_SIGNUP_URL || 'https://www.free-api.aiconvg.xin';

// 北京日（UTC+8，中国无夏令时）：返回 YYYYMMDD，作为「每日」额度日界，
// 与上游 02 的额度日界对齐（此前用 UTC 日，北京时间 08:00 才切日，会错位）。
export function beijingDayKey(now = new Date()) {
  const t = new Date(now.getTime() + 8 * 3600 * 1000);
  return t.toISOString().slice(0, 10).replace(/-/g, '');
}

// 游客每日额度（每 IP / 每实例，按北京日重置）。
// 只覆盖 3 个可试能力；ASR 只放同步 speech_to_text（单条 ≤60s），不含 submit_asr_job 长音频异步。
export const GUEST_LIMITS = {
  text_to_speech: Number(process.env.TRIAL_TTS_LIMIT || 30),
  speech_to_text: Number(process.env.TRIAL_ASR_LIMIT || 15),
  ocr_image: Number(process.env.TRIAL_OCR_LIMIT || 15),
};

// 可计数的可试工具（额度消耗型）
export const GUEST_QUOTA_TOOLS = new Set(Object.keys(GUEST_LIMITS));

// 游客可用工具白名单：3 个可试能力 + 2 个免费只读工具。
// 其余（submit_asr_job / get_asr_job / dubbing_* / video_*）游客一律拒绝。
export const GUEST_ALLOWED_TOOLS = new Set([
  'list_voices',
  'get_account',
  ...Object.keys(GUEST_LIMITS),
]);

export function isGuestAllowed(toolName) {
  return GUEST_ALLOWED_TOOLS.has(toolName);
}

// 游客调用白名单外工具时的拒绝文案（含引导注册）
export function guestBlockedMessage(toolName) {
  return [
    `[AUTH_REQUIRED] 游客试用不开放该工具：${toolName}（属高级 / 异步能力，仅注册用户可用）。`,
    '游客可免费试用：list_voices、get_account、text_to_speech、speech_to_text（单条≤60s）、ocr_image。',
    `注册免费账号获取完整能力与每日额度：${SIGNUP_URL}`,
  ].join('\n');
}

// 试用/游客额度用尽文案
export function guestExhaustedMessage(used, limit) {
  return [
    '[AUTH_REQUIRED] 免费试用次数已用完' + (limit != null ? `（本能力每日上限 ${limit} 次）` : '') + '。',
    `注册免费账号即可获得每日额度：${SIGNUP_URL}`,
    '拿到令牌后，在客户端 MCP 配置的 env 里设置 FREE_API_TOKEN 即可继续使用。',
  ].join('\n');
}

export function guestRemainingNote(tool, remaining) {
  return `（游客试用：${tool} 今日剩余 ${remaining} 次；注册后额度更高 — ${SIGNUP_URL}）`;
}

export function logGuest(event, data = {}) {
  logger.info(`guest.${event}`, data);
}
