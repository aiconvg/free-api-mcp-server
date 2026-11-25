import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { setDefaultToken, logger } from './context.js';
import { buildServer } from './server.js';

export async function runStdio(token) {
  const server = buildServer();
  const transport = new StdioServerTransport();
  // stdio 是单会话：令牌设为进程级默认，后续所有工具调用共用
  setDefaultToken(token);
  await server.connect(transport);
  logger.info('stdio.started', {});
}
