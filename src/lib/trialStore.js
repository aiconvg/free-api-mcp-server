import { createClient } from 'redis';
import { createHash } from 'node:crypto';
import { logger } from '../context.js';

// 试用计数（仅托管 HTTP）：
//   trial:ip:<sha256(ip)>     → 该 IP 的试用资格（首次置 1，TTL = TRIAL_TTL_HOURS）
//   trial:use:<ipHash>:<tool> → 该 IP 按能力已用次数（TTL 同上）
//   trial:global:<yyyymmdd>   → 全平台当日试用总次数（TTL 48h）
// 设计约束：
//   - fail-closed：Redis 不可用 → 拒绝试用（正式令牌路径不经过这里，不受影响）
//   - 以 IP 为主键、会话为辅：客户端重连换 sessionId 也刷不了额度
//   - INCR 原子扣减，先扣后调上游；上游失败由调用方回滚（rollbackUse）

const TTL_MS = Number(process.env.TRIAL_TTL_HOURS || 24) * 3600 * 1000;

let client = null;

function ipHash(ip) {
  return createHash('sha256').update(ip).digest('hex').slice(0, 24);
}

export async function initTrialStore() {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn('trial.disabled', { reason: 'REDIS_URL not set' });
    return null;
  }
  client = createClient({ url, database: Number(process.env.REDIS_DB || 1) });
  client.on('error', (e) => logger.error('trial.redis_error', { err: String(e?.message || e) }));
  await client.connect();
  logger.info('trial.redis_connected', {});
  return client;
}

export function trialStoreAvailable() {
  return !!client && client.isOpen;
}

// 返回 { allowed, remaining, usedThisCall, limits } 或 { allowed: false, reason }
export async function consumeTrial(ip, tool, limits) {
  if (!trialStoreAvailable()) return { allowed: false, reason: 'store_unavailable' };
  const h = ipHash(ip);
  try {
    // IP 试用资格键：首次写入（TTL=窗口期），期内不重发
    await client.set(`trial:ip:${h}`, '1', { NX: true, PX: TTL_MS });
    const limit = limits[tool];
    if (!limit) return { allowed: false, reason: 'tool_not_trialable' };

    // 全平台日上限（先查后占，占不中直接拒）
    const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const gKey = `trial:global:${day}`;
    const gUsed = await client.incr(gKey);
    if (gUsed === 1) await client.expire(gKey, 48 * 3600);
    const dailyCap = Number(process.env.TRIAL_DAILY_CAP || 200);
    if (gUsed > dailyCap) {
      await client.decr(gKey);
      return { allowed: false, reason: 'global_cap' };
    }

    const uKey = `trial:use:${h}:${tool}`;
    const used = await client.incr(uKey);
    if (used === 1) await client.expire(uKey, TTL_MS);
    if (used > limit) {
      await client.decr(uKey);
      await client.decr(gKey);
      return { allowed: false, reason: 'exhausted', used: used - 1, limit };
    }
    return {
      allowed: true,
      usedThisCall: used,
      remaining: Math.max(0, limit - used),
      limits,
      ipKey: uKey,
      gKey,
    };
  } catch (e) {
    logger.error('trial.consume_error', { err: String(e?.message || e) });
    return { allowed: false, reason: 'store_unavailable' };
  }
}

// 上游调用失败时回滚本次扣减（额度在后端本就"失败不扣"，MCP 试用计数保持同口径）
export async function rollbackTrial(token) {
  if (!trialStoreAvailable() || !token) return;
  try {
    await client.decr(token.ipKey);
    await client.decr(token.gKey);
  } catch (e) {
    logger.warn('trial.rollback_error', { err: String(e?.message || e) });
  }
}
