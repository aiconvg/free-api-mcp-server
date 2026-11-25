import { logger } from '../context.js';
import { readFileSync } from 'node:fs';

// 试用层（仅托管 HTTP）：无 Bearer 令牌的请求改用内置试用许可证调上游，
// 计数与封顶在 trialStore（Redis，fail-closed）。stdio 模式不经过这里。

const SIGNUP_URL = process.env.TRIAL_SIGNUP_URL || 'https://www.free-api.aiconvg.xin';

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

export function trialLimits() {
  return {
    text_to_speech: Number(process.env.TRIAL_TTS_LIMIT || 10),
    speech_to_text: Number(process.env.TRIAL_ASR_LIMIT || 5),
    submit_asr_job: Number(process.env.TRIAL_ASR_LIMIT || 5),
    ocr_image: Number(process.env.TRIAL_OCR_LIMIT || 5),
  };
}

export const TRIALABLE_TOOLS = new Set(Object.keys(trialLimits()));

// 试用模式的错误与引导文案（AUTH_REQUIRED 为 MCP 本地码，02 不返回它）
export function trialExhaustedMessage(used, limit) {
  return [
    '[AUTH_REQUIRED] 免费试用次数已用完' + (limit != null ? `（本能力上限 ${limit} 次）` : '') + '。',
    `注册免费账号即可获得每日额度（TTS 100 / ASR 50 / OCR 50 次）：${SIGNUP_URL}`,
    '拿到令牌后，在客户端 MCP 配置的 env 里设置 FREE_API_TOKEN 即可继续使用。',
  ].join('\n');
}

export function trialRemainingNote(tool, remaining, limits) {
  return `（试用模式：${tool} 剩余 ${remaining} 次；注册后每日额度更高 — ${SIGNUP_URL}）`;
}

export function logTrial(event, data = {}) {
  logger.info(`trial.${event}`, data);
}
