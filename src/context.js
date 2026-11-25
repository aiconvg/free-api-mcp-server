import { AsyncLocalStorage } from 'node:async_hooks';

// 请求级上下文：HTTP 传输下由 Express 中间件写入 { token, trial }，
// tool handler 读取。trial = { active, tool, remaining, limits, rollbackToken }。
// stdio 模式为单会话，启动时写入进程级默认令牌作为兜底。
// 禁止在 HTTP 路径用全局变量传令牌（并发会串号）。
export const requestContext = new AsyncLocalStorage();

let defaultToken = null;
// stdio 游客模式开关（进程级）。HTTP 路径恒为 false，互不影响。
let guestMode = false;

export function setDefaultToken(token) {
  defaultToken = token || null;
}

export function setGuestMode(v) {
  guestMode = !!v;
}

export function isGuestMode() {
  return guestMode;
}

export function getRequestToken() {
  const ctx = requestContext.getStore();
  return ctx?.token || defaultToken;
}

export function getRequestTrial() {
  const ctx = requestContext.getStore();
  return ctx?.trial || null;
}

// 真实客户端 IP（HTTP 传输下由 http.js 逐请求写入，stdio 下为 null）。
// 用于回源头透传 X-Ca-Client-IP，让 BFF 的 openRate 能按真实用户分流。
export function getRequestClientIp() {
  const ctx = requestContext.getStore();
  return ctx?.clientIp || null;
}

export function log(level, msg, data = undefined) {
  const entry = { ts: new Date().toISOString(), level, msg };
  if (data) entry.data = data;
  // stdio 传输下 stdout 是协议通道，日志只能走 stderr
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export const logger = {
  debug: (msg, data) => {
    if (process.env.LOG_LEVEL === 'debug') log('debug', msg, data);
  },
  info: (msg, data) => log('info', msg, data),
  warn: (msg, data) => log('warn', msg, data),
  error: (msg, data) => log('error', msg, data),
};
