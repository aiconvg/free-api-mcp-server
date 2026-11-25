import { z } from 'zod';
import { api } from '../lib/apiClient.js';
import { getRequestTrial, isGuestMode } from '../context.js';
import { GUEST_LIMITS, nextBeijingResetAt } from '../lib/guestGate.js';
import { getTrialUsage } from '../lib/trialStore.js';
import { getLocalUsage } from '../lib/localCounter.js';

function maskIp(ip) {
  const s = String(ip || '');
  if (!s) return null;
  const parts = s.split('.');
  if (parts.length === 4) return `${parts[0]}.${parts[1]}.${parts[2]}.*`;
  return s.replace(/:[^:]+$/, ':*');
}

// P0-2：游客/trial 上下文追加「本 IP / 本实例」的个人额度视图（30/15/15，北京 00:00 重置）。
// 注册令牌路径不追加（personal=null），行为与旧版一致。
async function buildPersonalView() {
  const trial = getRequestTrial();
  const guest = !!trial?.active || isGuestMode();
  if (!guest) return null;
  let usage; let scope; let ip = null;
  if (trial?.active) {
    usage = await getTrialUsage(trial.ip, GUEST_LIMITS);
    scope = 'ip'; ip = maskIp(trial.ip);
  } else {
    usage = getLocalUsage();
    scope = 'local-instance';
  }
  const capabilities = {};
  let exhausted = false;
  for (const tool of Object.keys(GUEST_LIMITS)) {
    const u = usage[tool] || { used: 0, limit: GUEST_LIMITS[tool], remaining: GUEST_LIMITS[tool] };
    capabilities[tool] = { used: u.used, limit: u.limit, remaining: u.remaining };
    if (u.remaining <= 0) exhausted = true;
  }
  return {
    scope,
    ...(ip ? { ip } : {}),
    resetAt: nextBeijingResetAt(),
    capabilities,
    exhausted,
    note: `游客个人额度视图（${scope === 'ip' ? '本 IP' : '本实例'}，MCP 计数，北京日 00:00 重置）；上游 quota 为共享游客池口径（app.limit 实测约 3600–4000），二者不同维，勿混用。`,
    ...(exhausted ? { hint: '本 IP 已用尽，可注册或更换网络：https://www.free-api.aiconvg.xin' } : {}),
  };
}

export const getAccountTool = {
  name: 'get_account',
  title: '查询额度与账户状态',
  description:
    '查询当前令牌的应用档位（free/paid）、各能力当日额度用量（tts/asr/ocr 的 used/limit/remaining）、' +
    '额度重置时间与许可证有效期。只读，不消耗额度。游客模式下额外返回 personal 字段（本 IP/本实例的个人 30/15/15 用量与北京 00:00 重置）。',
  inputSchema: { type: 'object', properties: {} },
  outputSchema: {
    type: 'object', additionalProperties: true,
    properties: {
      requestId: { type: 'string' },
      app: { type: 'object', additionalProperties: true },
      quota: { type: 'object', additionalProperties: true },
      personal: { type: 'object', additionalProperties: true, description: '游客个人额度视图（仅 guest/trial 返回）' },
    },
  },
  zodSchema: z.object({}),
  async handler() {
    const base = await api.getAccount();
    const personal = await buildPersonalView();
    return personal ? { ...base, personal } : base;
  },
};
