import { getRequestToken, getRequestTrial, getRequestClientIp, logger } from '../context.js';
import { trialToken } from './trial.js';

// 上游错误 envelope 见 16 号仓主契约 components.schemas.Error：
// { code, message, requestId, retryAfter?, resetAt?, quota? }
export class UpstreamError extends Error {
  constructor(payload, httpStatus) {
    super(payload?.message || 'upstream error');
    this.name = 'UpstreamError';
    this.code = payload?.code || 'INTERNAL_ERROR';
    this.requestId = payload?.requestId || null;
    this.retryAfter = payload?.retryAfter ?? null;
    this.resetAt = payload?.resetAt ?? null;
    this.quota = payload?.quota ?? null;
    this.httpStatus = httpStatus;
  }
}

export class AuthRequiredError extends Error {
  constructor(message) {
    super(message);
    this.name = 'AuthRequiredError';
    this.code = 'AUTH_REQUIRED';
  }
}

const BASE_URL = (process.env.FREE_API_BASE_URL || '').replace(/\/+$/, '');
// 02 反代 60s 超时不可调，客户端不得自设更短超时掐断长合成
const REQUEST_TIMEOUT_MS = 75_000;

function authHeaders() {
  // 试用模式：无用户令牌，改用内置试用许可证（仅托管 HTTP 会出现）
  const trial = getRequestTrial();
  const token = getRequestToken() || (trial?.active ? trialToken() : null);
  if (!token) throw new AuthRequiredError('未配置访问令牌：请先注册并获取免费许可证，再配置 Bearer token 后重试。');
  // 主契约 licenseToken 通道：专用头优先；Bearer 形态生产已打开
  return { 'X-License-Token': token };
}

async function callApi(method, path, body = undefined) {
  if (!BASE_URL) throw new AuthRequiredError('服务端未配置 FREE_API_BASE_URL');
  const headers = { ...authHeaders() };
  // 透传真实客户端 IP 给 BFF：BFF openRate.clientIp 优先认 X-Ca-Client-IP，
  // 用于「仅 MCP 应用（app26）按真实用户 5/s 分流」。stdio 无请求上下文时不加。
  const clientIp = getRequestClientIp();
  if (clientIp) headers['X-Ca-Client-IP'] = clientIp;
  const opts = { method, headers, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  logger.info('upstream.call', { method, path });
  let res;
  try {
    res = await fetch(`${BASE_URL}${path}`, opts);
  } catch (e) {
    logger.error('upstream.network_error', { path, err: String(e?.cause || e) });
    const err = new UpstreamError({ code: 'UPSTREAM_UNAVAILABLE', message: '上游网络不可达，请稍后重试' }, 503);
    err.retryable = true;
    throw err;
  }
  let payload = null;
  try {
    payload = await res.json();
  } catch {
    payload = null;
  }
  if (!res.ok) throw new UpstreamError(payload, res.status);
  return payload;
}

export const api = {
  listVoices: (lang) => callApi('GET', `/v1/voices${lang ? `?lang=${encodeURIComponent(lang)}` : ''}`),
  getAccount: () => callApi('GET', '/v1/account'),
  // 计费端点：失败不消耗额度（后端自动返还预占）；本层不做自动重试
  tts: ({ text, voice, speed, format, engine }) => callApi('POST', '/v1/tts', { text, voice, ...(speed !== undefined ? { speed } : {}), ...(format ? { format } : {}), ...(engine ? { engine } : {}) }),
  asrSync: ({ audioUrl, lang, engine }) => callApi('POST', '/v1/asr', { audioUrl, ...(lang ? { lang } : {}), ...(engine ? { engine } : {}) }),
  asrSubmit: ({ audioUrl, lang, engine }) => callApi('POST', '/v1/asr/jobs', { audioUrl, ...(lang ? { lang } : {}), ...(engine ? { engine } : {}) }),
  asrGet: (taskId) => callApi('GET', `/v1/asr/jobs/${encodeURIComponent(taskId)}`),
  ocr: ({ imageUrl, mode }) => callApi('POST', '/v1/ocr', { imageUrl, ...(mode ? { mode } : {}) }),
  // ── 付费能力（积分计费，2026-11-06 接入）：失败同样不自动重试 ──
  dubbingVoices: () => callApi('GET', '/v1/dubbing/voices'),
  dubbingSubmit: ({ segments }) => callApi('POST', '/v1/dubbing', { segments }),
  dubbingGet: (taskId) => callApi('GET', `/v1/dubbing/tasks/${encodeURIComponent(taskId)}`),
  dubbingCancel: (taskId) => callApi('POST', `/v1/dubbing/tasks/${encodeURIComponent(taskId)}/cancel`, {}),
  videoSubmit: (url) => callApi('POST', '/v1/video/transcribe', { url }),
  videoGet: (taskId) => callApi('GET', `/v1/video/transcribe/${encodeURIComponent(taskId)}`),
};
