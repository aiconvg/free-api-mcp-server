#!/usr/bin/env node
// 入口：按 MCP_TRANSPORT 选择 stdio 或 http。
// stdio：令牌优先 FREE_API_TOKEN（正式令牌）；无则回退游客试用令牌 TRIAL_LICENSE_TOKEN / TRIAL_LICENSE_TOKEN_FILE；两者皆无才 fatal。
// http：令牌来自每次请求的 Authorization: Bearer <token>（见 http.js 中间件）。
import { runStdio } from './stdio.js';
import { runHttp } from './http.js';
import { trialToken } from './lib/trial.js';

const transport = (process.env.MCP_TRANSPORT || 'stdio').toLowerCase();

if (transport === 'stdio') {
  let token = process.env.FREE_API_TOKEN || '';
  let guest = false;
  if (!token) {
    const trial = trialToken();
    if (trial) {
      token = trial;
      guest = true;
    }
  }
  if (!token) {
    process.stderr.write(
      '[fatal] stdio 模式需设置 FREE_API_TOKEN（正式令牌），或提供 TRIAL_LICENSE_TOKEN / TRIAL_LICENSE_TOKEN_FILE 以游客试用\n',
    );
    process.exit(1);
  }
  if (guest) {
    process.stderr.write(
      '[info] 游客模式：限次免费试用（每实例每北京日有上限，全局限额由上游兜底）。注册获取更高每日额度 → https://www.open-api.aiconvg.xin\n',
    );
  }
  runStdio(token, { guest }).catch((e) => {
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
