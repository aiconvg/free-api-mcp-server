// HTTP 传输：Streamable HTTP + /healthz。
// 令牌：每次请求从 Authorization: Bearer 提取，用 AsyncLocalStorage 传给 handler（请求级隔离）。
// 试用：无令牌 + TRIAL_LICENSE_TOKEN 已配置 → 进入试用上下文（IP 计数），
//       Redis 不可用时 fail-closed，只放行只读工具并提示注册。
import express from 'express';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { requestContext, logger } from './context.js';
import { buildServer } from './server.js';
import { initTrialStore, trialStoreAvailable } from './lib/trialStore.js';
import { trialEnabled } from './lib/trial.js';

const PORT = Number(process.env.MCP_HTTP_PORT || 3210);
const ALLOWED_ORIGINS = (process.env.MCP_ALLOWED_ORIGINS || '')
  .split(',').map((s) => s.trim()).filter(Boolean);

function extractBearer(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m ? m[1].trim() : null;
}

// 真实客户端 IP 提取。信任边界：**只有当连接对端是本机回环**（自有反代 -> 本进程）
// 时才信任反代覆写的转发头——反代用 X-Real-IP 覆盖，客户端自带的 X-Real-IP/XFF 一律被盖掉、伪造不了。
// 非回环对端（理论上不应出现，端口只绑回环）一律直接用连接 IP，不信任任何头；
// 优先取 X-Real-IP，取不到再回退。
function isLoopback(addr) {
  return addr === '127.0.0.1' || addr === '::1' || addr === '::ffff:127.0.0.1';
}
function normalizeIp(ip) {
  let s = String(ip || '').trim();
  if (s.startsWith('::ffff:')) s = s.slice(7);
  return s;
}
export function clientIp(req) {
  const remote = req.socket?.remoteAddress || 'unknown';
  // 非回环对端：不信任任何转发头
  if (!isLoopback(remote)) return normalizeIp(remote) || remote;
  // 回环对端（自有反代）：优先 X-Real-IP（上游覆写，不可伪造）
  const xri = req.headers['x-real-ip'];
  if (typeof xri === 'string' && xri.trim()) return normalizeIp(xri) || remote;
  // 回退：兼容旧部署——XFF 末位为回环则取倒数第二位
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.length > 0) {
    const parts = xff.split(',').map((s) => s.trim()).filter(Boolean);
    const last = parts[parts.length - 1];
    if (isLoopback(last)) return parts.length >= 2 ? normalizeIp(parts[parts.length - 2]) : remote;
    // XFF 无回环尾：末位即真实客户端
    if (parts.length >= 1) return normalizeIp(parts[parts.length - 1]);
  }
  return remote;
}

export async function runHttp() {
  await initTrialStore();
  const server = buildServer();
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb' }));

  app.get('/healthz', (_req, res) => {
    res.json({
      ok: true,
      transport: 'http',
      trial: trialEnabled() ? (trialStoreAvailable() ? 'ready' : 'degraded') : 'off',
    });
  });

  // Origin 白名单（SDK 只在 DNS rebinding 校验里做 Host，Origin 需自行把关）
  app.use('/mcp', (req, res, next) => {
    const origin = req.headers.origin;
    if (origin && ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) {
      return res.status(403).json({ error: 'origin not allowed' });
    }
    next();
  });

  app.all('/mcp', (req, res) => {
    const token = extractBearer(req);
    // 无令牌：试用启用且存储可用 → 试用上下文；否则放行让 handler 抛 AUTH_REQUIRED（引导注册）
    let trialCtx = null;
    if (!token && trialEnabled()) {
      if (trialStoreAvailable()) {
        trialCtx = { active: true, ip: clientIp(req) };
      } // Redis 不可用：fail-closed，不计费工具会被闸门拦下引导注册
    }
    requestContext.run({ token, trial: trialCtx, clientIp: clientIp(req) }, async () => {
      // 每请求一个传输实例（无会话态，最简且并发安全）
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      res.on('close', () => transport.close());
      try {
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
      } catch (e) {
        logger.error('http.request_error', { err: String(e?.stack || e) });
        if (!res.headersSent) {
          res.status(500).json({ error: 'internal error' });
        }
      }
    });
  });

  await new Promise((resolve, reject) => {
    // 只监听回环：托管端点仅经反代对外，避免端口直接暴露公网
    const srv = app.listen(PORT, '127.0.0.1', () => {
      logger.info('http.started', { port: PORT, origins: ALLOWED_ORIGINS.length || 'any' });
      resolve();
    });
    srv.on('error', reject);
  });
  // 阻止进程退出：保持事件循环活跃（nohup/后台启动时无活跃句柄会立即 exit）
  setInterval(() => {}, 1 << 30);
}
