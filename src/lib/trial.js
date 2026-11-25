import { logger } from '../context.js';
import { readFileSync } from 'node:fs';
import { GUEST_LIMITS, GUEST_QUOTA_TOOLS, guestExhaustedMessage, guestRemainingNote } from './guestGate.js';

// 试用层（托管 HTTP 无令牌 / stdio 游客）：无用户令牌时改用内置试用许可证调上游。
//   计数与封顶：托管 HTTP → trialStore（Redis，fail-closed）；stdio 游客 → localCounter（本地文件）。
// 可试能力与额度唯一事实源在 guestGate（GUEST_LIMITS / GUEST_QUOTA_TOOLS），此处只做令牌加载与转发。

// 支持两种配置方式：
//  1) TRIAL_LICENSE_TOKEN=<token 字面量>（.env 或环境变量）
//  2) TRIAL_LICENSE_TOKEN_FILE=<路径>（如 data/.trial_token，600 权限，gitignore）
// 文件方式避免令牌进入 pm2 dump / .env 等持久面。
function loadTrialToken() {
  if (process.env.TRIAL_LICENSE_TOKEN) return process.env.TRIAL_LICENSE_TOKEN;
  const f = process.env.TRIAL_LICENSE_TOKEN_FILE;
  if (!f) return '';
  try {
    return readFileSync(f, 'utf8').trim();
  } catch {
    console.error('[trial] TRIAL_LICENSE_TOKEN_FILE 无法读取:', f);
    return '';
  }
}

export function trialEnabled() {
  return !!loadTrialToken();
}

export function trialToken() {
  return loadTrialToken();
}

// 试用额度：以 guestGate.GUEST_LIMITS 为唯一事实源。
// 默认 TTS 30 / ASR(speech_to_text) 15 / OCR 15；submit_asr_job 不在可试集合（游客禁用长音频异步旁路）。
export function trialLimits() {
  return GUEST_LIMITS;
}

// 可试（计数）工具集：text_to_speech / speech_to_text / ocr_image
export const TRIALABLE_TOOLS = GUEST_QUOTA_TOOLS;

// 文案统一由 guestGate 提供（数字与引导口径一致）
export function trialExhaustedMessage(used, limit) {
  return guestExhaustedMessage(used, limit);
}

export function trialRemainingNote(tool, remaining) {
  return guestRemainingNote(tool, remaining);
}

export function logTrial(event, data = {}) {
  logger.info(`trial.${event}`, data);
}
