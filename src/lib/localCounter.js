// stdio 游客本地日计数（文件）——二级限流。
// stdio 没有真实 IP / Redis：每个进程实例按「北京日 · 每工具」落一个本地文件计数，
// 只防同一实例无限刷；真正可靠的全局限额压在上游 02 的游客专用令牌（日额度 + 限流）。
// 说明：文件按日期命名，天然按北京日重置；删文件 / 重装可绕过，故仅作软限，不替代上游硬顶。
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { logger } from '../context.js';
import { beijingDayKey, GUEST_LIMITS } from './guestGate.js';

function counterFile() {
  return process.env.MCP_LOCAL_COUNTER_FILE || join(tmpdir(), `free-api-mcp-trial-${beijingDayKey()}.json`);
}

function load() {
  try {
    if (existsSync(counterFile())) return JSON.parse(readFileSync(counterFile(), 'utf8')) || {};
  } catch (e) {
    logger.warn('trial.local_counter_read_error', { err: String(e?.message || e) });
  }
  return {};
}

function save(obj) {
  try {
    writeFileSync(counterFile(), JSON.stringify(obj));
  } catch (e) {
    logger.warn('trial.local_counter_write_error', { err: String(e?.message || e) });
  }
}

// 本地每实例每日限额：可用 TRIAL_LOCAL_* 覆盖；默认与远端游客额度（GUEST_LIMITS）对齐。
export function localLimits() {
  return {
    text_to_speech: Number(process.env.TRIAL_LOCAL_TTS_LIMIT || GUEST_LIMITS.text_to_speech),
    speech_to_text: Number(process.env.TRIAL_LOCAL_ASR_LIMIT || GUEST_LIMITS.speech_to_text),
    ocr_image: Number(process.env.TRIAL_LOCAL_OCR_LIMIT || GUEST_LIMITS.ocr_image),
  };
}

export const LOCAL_TRIALABLE_TOOLS = new Set(Object.keys(localLimits()));

// 返回 { allowed, usedThisCall, remaining, limits, tool } 或 { allowed:false, reason, used?, limit? }
export function consumeLocal(tool) {
  const limits = localLimits();
  const limit = limits[tool];
  if (!limit) return { allowed: false, reason: 'tool_not_trialable' };
  const db = load();
  const used = Number(db[tool] || 0);
  if (used >= limit) return { allowed: false, reason: 'exhausted', used, limit };
  db[tool] = used + 1;
  save(db);
  return { allowed: true, usedThisCall: used + 1, remaining: Math.max(0, limit - (used + 1)), limits, tool };
}

// 上游失败回滚本次本地扣减（与后端「失败不扣」同口径）
export function rollbackLocal(ticket) {
  if (!ticket || !ticket.tool) return;
  try {
    const db = load();
    const used = Number(db[ticket.tool] || 0);
    if (used > 0) db[ticket.tool] = used - 1;
    save(db);
  } catch (e) {
    logger.warn('trial.local_rollback_error', { err: String(e?.message || e) });
  }
}

// 只读：取本实例当个北京日各可试能力已用次数（stdio 游客 get_account 个人视图用）。
// 返回 { <tool>: { used, limit, remaining } }。
export function getLocalUsage() {
  const limits = localLimits();
  const db = load();
  const out = {};
  for (const tool of Object.keys(limits)) {
    const used = Number(db[tool] || 0);
    const limit = limits[tool];
    out[tool] = { used, limit, remaining: Math.max(0, limit - used) };
  }
  return out;
}
