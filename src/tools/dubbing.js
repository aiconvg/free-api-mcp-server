import { z } from 'zod';
import { api } from '../lib/apiClient.js';

// ── 多角色配音（积分计费 · /v1/dubbing，2026-11-06 接入 MCP）──────────────
// 计费口径：按音色单价扣积分（商业音色如 Cherry 2 积分/字，开源免费音色 0 积分），
// 提交按预估冻结、只结算成功段、失败/取消全额解冻。计费工具：失败不自动重试。

export const dubbingVoicesTool = {
  name: 'list_dubbing_voices',
  title: '查询配音音色目录',
  description:
    '查询多角色配音可用的音色目录（70 个，含 21 个开源免费音色）。' +
    '返回每个音色的 id、性别、语言、单价 creditsPerChar（免费音色为 0）。' +
    '提交配音前先从这里选音色 id；不计费。',
  inputSchema: { type: 'object', properties: {} },
  zodSchema: z.object({}).optional(),
  async handler() {
    return api.dubbingVoices();
  },
};

export const dubbingSubmitTool = {
  name: 'dubbing_submit',
  title: '提交多角色配音',
  description:
    '多角色配音：按 segments（[{voice, text}]，至少一段）合成带时间轴的语音，' +
    '返回音频 URL 与 SRT 字幕。计费工具：按所选音色单价扣积分（免费音色 0 积分），' +
    '小任务同步返回（audioUrl/srtUrl/creditCost），大任务异步 202 返回 taskId，' +
    '用 get_dubbing_task 轮询（建议每 5 秒，不要无限轮询）。失败不自动重试。',
  inputSchema: {
    type: 'object',
    required: ['segments'],
    properties: {
      segments: {
        type: 'array',
        minItems: 1,
        description: '配音分段列表，按顺序合成',
        items: {
          type: 'object',
          required: ['voice', 'text'],
          properties: {
            voice: { type: 'string', description: '音色 id（先 list_dubbing_voices 查询）' },
            text: { type: 'string', description: '该段台词' },
          },
        },
      },
    },
  },
  zodSchema: z.object({
    segments: z.array(z.object({
      voice: z.string().min(1, 'voice 必填'),
      text: z.string().min(1, 'text 必填'),
    })).min(1, 'segments 至少一段').max(100, 'segments 最多 100 段'),
  }),
  async handler(args) {
    return api.dubbingSubmit(args);
  },
};

export const dubbingGetTool = {
  name: 'get_dubbing_task',
  title: '查询配音任务结果',
  description:
    '按 taskId 查询异步配音任务状态：处理中 / succeeded（返回 audioUrl、srtUrl、chargedCredits 实扣）/' +
    'partial（部分段失败，只结算成功段）/ failed / cancelled（全额解冻）。' +
    '不计费、可安全重复轮询。',
  inputSchema: {
    type: 'object',
    required: ['taskId'],
    properties: { taskId: { type: 'string', description: 'dubbing_submit 异步返回的任务 ID' } },
  },
  zodSchema: z.object({ taskId: z.string().min(1, 'taskId 必填') }),
  async handler(args) {
    return api.dubbingGet(args.taskId);
  },
};

export const dubbingCancelTool = {
  name: 'cancel_dubbing_task',
  title: '取消配音任务',
  description:
    '取消尚未完成的异步配音任务，已冻结的预估积分立即全额解冻。' +
    '已完成（succeeded/partial）的任务不可取消。不计费。',
  inputSchema: {
    type: 'object',
    required: ['taskId'],
    properties: { taskId: { type: 'string', description: 'dubbing_submit 异步返回的任务 ID' } },
  },
  zodSchema: z.object({ taskId: z.string().min(1, 'taskId 必填') }),
  async handler(args) {
    return api.dubbingCancel(args.taskId);
  },
};
