import { z } from 'zod';
import { api } from '../lib/apiClient.js';

export const asrSubmitTool = {
  name: 'submit_asr_job',
  title: '提交长音频转写任务',
  description:
    '提交异步转写任务（长音频入口），立即返回 taskId。计费工具：提交即占 1 次当日 ASR 额度，' +
    '任务失败时额度自动返还。audioUrl ≤ 50MB；提交后用 get_asr_job 轮询' +
    '（建议首轮 3 秒、之后每 5 秒，总时长 ≤ 10 分钟，不要无限轮询）。单次调用不内部等待。',
  inputSchema: {
    type: 'object',
    required: ['audioUrl'],
    properties: {
      audioUrl: { type: 'string', description: '长音频公网 URL，≤ 50MB（时长无 60 秒限制）' },
      lang: { type: 'string', description: '语种，auto 自动判定（默认）' },
    },
  },
  outputSchema: {
    type: 'object', additionalProperties: true,
    properties: {
      requestId: { type: 'string' },
      taskId: { type: 'string' },
      status: { type: 'string', enum: ['queued', 'running'] },
      duration: { type: 'number', nullable: true },
      quota: { type: 'object', additionalProperties: true },
    },
  },
  zodSchema: z.object({
    audioUrl: z.string().url('必须是 http(s) 公网 URL'),
    lang: z.string().optional(),
  }),
  async handler(args) {
    return api.asrSubmit(args);
  },
};
