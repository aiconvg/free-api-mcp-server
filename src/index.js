#!/usr/bin/env node
// 入口：按 MCP_TRANSPORT 选择 stdio 或 http。
// stdio：令牌来自 FREE_API_TOKEN（进程环境，客户端配置里注入）。
// http：令牌来自每次请求的 Authorization: Bearer <token>（见 http.js 中间件）。
import { runStdio } from './stdio.js';
import { runHttp } from './http.js';

const transport = (process.env.MCP_TRANSPORT || 'stdio').toLowerCase();

if (transport === 'stdio') {
  if (!process.env.FREE_API_TOKEN) {
    process.stderr.write('[fatal] stdio 模式必须设置 FREE_API_TOKEN 环境变量\n');
    process.exit(1);
  }
  runStdio(process.env.FREE_API_TOKEN).catch((e) => {
    process.stderr.write(`[fatal] ${e?.stack || e}\n`);
    process.exit(1);
  });
} else if (transport === 'http') {
  runHttp().catch((e) => {
    process.stderr.write(`[fatal] ${e?.stack || e}\n`);
    process.exit(1);
  });
} else {
  process.stderr.write(`[fatal] 未知的 MCP_TRANSPORT: ${transport}（支持 stdio | http）\n`);
  process.exit(1);
}
