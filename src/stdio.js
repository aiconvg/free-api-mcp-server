import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setDefaultToken, setGuestMode, logger } from './context.js';
import { buildServer } from './server.js';

export async function runStdio(token, opts = {}) {
  const server = buildServer();
  const transport = new StdioServerTransport();
  // stdio 是单会话：令牌设为进程级默认，后续所有工具调用共用
  setDefaultToken(token);
  // 游客模式：启用本地日计数二级限流（真实全局限额在上游 02 游客专用令牌）
  setGuestMode(!!opts.guest);
  await server.connect(transport);
  logger.info('stdio.started', { guest: !!opts.guest });
}
