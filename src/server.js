import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { getRequestTrial, isGuestMode, logger } from './context.js';
import { errorToMcpContent, formatInvalidParam } from './lib/errors.js';
import { consumeTrial, rollbackTrial, trialStoreAvailable } from './lib/trialStore.js';
import { consumeLocal, rollbackLocal } from './lib/localCounter.js';
import { isGuestAllowed, guestBlockedMessage, logGuest } from './lib/guestGate.js';
import { TRIALABLE_TOOLS, trialLimits, trialExhaustedMessage, trialRemainingNote, logTrial } from './lib/trial.js';
import { listVoicesTool } from './tools/voices.js';
import { getAccountTool } from './tools/account.js';
import { ttsTool } from './tools/tts.js';
import { asrSyncTool } from './tools/asrSync.js';
import { asrSubmitTool } from './tools/asrSubmit.js';
import { asrGetTool } from './tools/asrGet.js';
import { ocrTool } from './tools/ocr.js';
import { dubbingVoicesTool, dubbingSubmitTool, dubbingGetTool, dubbingCancelTool } from './tools/dubbing.js';
import { videoSubmitTool, videoGetTool } from './tools/video.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// 版本单一事实源：以 package.json.version 为准，避免运行时 Server 版本与包版本漂移
// （此前此处写死 '0.2.0'，与 package.json/server.json 的 0.1.0 不一致）。
export const PKG_VERSION = JSON.parse(
  readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf8'),
).version;

// 工具注册表：每个工具 { name, description, inputSchema, zodSchema, handler }
// handler 只依赖 apiClient，不 import SDK 类型，便于以后换传输或被 Skill 复用。
// 注：GET /v1/artifacts/{fileName} 有意不映射（audioUrl 已是带签名的公网直链，
// 且该端点返回二进制流，不适合文本型工具结果）——见 docs/工具拆分说明.md。
// 2026-11-06：付费能力接入（多角色配音 / 视频链接转文字，积分计费，不在试用层）。
export const TOOLS = [
  listVoicesTool,
  getAccountTool,
  ttsTool,
  asrSyncTool,
  asrSubmitTool,
  asrGetTool,
  ocrTool,
  dubbingVoicesTool,
  dubbingSubmitTool,
  dubbingGetTool,
  dubbingCancelTool,
  videoSubmitTool,
  videoGetTool,
];

export const TOOL_COUNT = TOOLS.length;

// MCP 工具注解（tools/list 的 annotations 字段，平台自动发现/审核依赖）：
// readOnlyHint：只读工具=true（不改外部状态）；openWorldHint=true（均访问外部开放 API / 公网 URL）；
// destructiveHint 全部=false（无破坏性删除）；idempotentHint 按语义：只读/取消类可重复=true，计费/建任务类=false。
const READ_ONLY_TOOLS = new Set([
  'list_voices', 'get_account', 'list_dubbing_voices',
  'get_asr_job', 'get_dubbing_task', 'get_video_transcribe',
]);
const IDEMPOTENT_TOOLS = new Set([...READ_ONLY_TOOLS, 'cancel_dubbing_task']);
export const TOOL_ANNOTATIONS = Object.fromEntries(
  TOOLS.map((t) => [t.name, {
    readOnlyHint: READ_ONLY_TOOLS.has(t.name),
    destructiveHint: false,
    idempotentHint: IDEMPOTENT_TOOLS.has(t.name),
    openWorldHint: true,
  }]),
);

export function buildServer() {
  const server = new Server(
    { name: 'free-api-mcp', version: PKG_VERSION },
    { capabilities: { tools: {} } },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS.map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      ...(t.outputSchema ? { outputSchema: t.outputSchema } : {}),
      annotations: TOOL_ANNOTATIONS[t.name],
    })),
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params?.name;
    const args = req.params?.arguments || {};
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) {
      return {
        isError: true,
        content: [{ type: 'text', text: `[INVALID_PARAM] 未知工具: ${name}` }],
      };
    }
    const parsed = tool.zodSchema.safeParse(args);
    if (!parsed.success) {
      return {
        isError: true,
        content: [{
          type: 'text',
          text: formatInvalidParam(name, parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'} ${i.message}`).join('; ')),
        }],
      };
    }

    // 游客闸门（白名单）：托管 HTTP 无令牌试用（trial.active）或 stdio 游客模式，均按白名单放行。
    // 非白名单工具（submit_asr_job 长音频异步旁路 / 配音 / 视频等）游客一律拒，堵旁路。
    const trial = getRequestTrial();
    const guest = !!trial?.active || isGuestMode();
    if (guest && !isGuestAllowed(name)) {
      logGuest('blocked', { tool: name, transport: trial?.active ? 'http-trial' : 'stdio-guest' });
      return {
        isError: true,
        content: [{ type: 'text', text: guestBlockedMessage(name) }],
      };
    }

    // 试用/游客额度闸门（只对可试计数工具）：
    //  - 托管 HTTP 无令牌：Redis 计数（IP 维度，北京日），失败回滚
    //  - stdio 游客：本地文件日计数（每实例维度，北京日）二级限流，失败回滚；全局限额在上游 02
    let trialTicket = null;
    let localTicket = null;
    if (trial?.active && TRIALABLE_TOOLS.has(name)) {
      if (!trialStoreAvailable()) {
        return {
          isError: true,
          content: [{ type: 'text', text: '[AUTH_REQUIRED] 试用服务暂不可用，请注册后使用：https://www.free-api.aiconvg.xin' }],
        };
      }
      const limits = trialLimits();
      const ticket = await consumeTrial(trial.ip, name, limits);
      if (!ticket.allowed) {
        logTrial('denied', { tool: name, reason: ticket.reason });
        return {
          isError: true,
          content: [{ type: 'text', text: trialExhaustedMessage(ticket.used, ticket.limit) }],
        };
      }
      trialTicket = ticket;
      logTrial('consume', { tool: name, used: ticket.usedThisCall, remaining: ticket.remaining });
    } else if (!trial?.active && isGuestMode() && TRIALABLE_TOOLS.has(name)) {
      const ticket = consumeLocal(name);
      if (!ticket.allowed) {
        logTrial('local_denied', { tool: name, reason: ticket.reason });
        return {
          isError: true,
          content: [{ type: 'text', text: trialExhaustedMessage(ticket.used, ticket.limit) }],
        };
      }
      localTicket = ticket;
      logTrial('local_consume', { tool: name, used: ticket.usedThisCall, remaining: ticket.remaining });
    }

    const started = Date.now();
    try {
      const result = await tool.handler(parsed.data);
      logger.info('tool.call', { tool: name, ms: Date.now() - started, ok: true });
      // P0-1：content[0].text 只放纯 JSON（保证客户端 json.loads 能过）。
      // 游客剩余次数/注册引导改放「第二个 content block」（audience=assistant），不混入机器可解析的 JSON。
      const content = [{ type: 'text', text: JSON.stringify(result, null, 2) }];
      const notes = [];
      if (trialTicket) notes.push(trialRemainingNote(name, trialTicket.remaining, trialTicket.limits));
      if (localTicket) notes.push(trialRemainingNote(name, localTicket.remaining, localTicket.limits));
      if (notes.length) {
        content.push({ type: 'text', text: notes.join('\n'), annotations: { audience: ['assistant'] } });
      }
      const out = { content };
      // P1-6：声明了 outputSchema 的工具，额外回结构化结果（与 content[0].text 的纯 JSON 同源）
      if (tool.outputSchema && result && typeof result === 'object') out.structuredContent = result;
      return out;
    } catch (err) {
      logger.warn('tool.call', {
        tool: name,
        ms: Date.now() - started,
        ok: false,
        code: err?.code || 'INTERNAL_ERROR',
      });
      // 上游失败：后端不扣额度，试用/游客计数同口径回滚
      if (trialTicket) await rollbackTrial(trialTicket);
      if (localTicket) rollbackLocal(localTicket);
      return errorToMcpContent(err, { toolName: name });
    }
  });

  return server;
}
