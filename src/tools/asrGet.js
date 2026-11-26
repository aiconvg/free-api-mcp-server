import { z } from 'zod';
import { api } from '../lib/apiClient.js';

export const asrGetTool = {
  name: 'get_asr_job',
  title: '查询长音频任务结果',
  description:
    '按 taskId 查询异步转写任务状态：queued/running（带 segments_done/processed_s 进度）、' +
    'done（返回 text/segments）、failed（error 字段，额度已自动返还）。不计费、不重复扣额度，' +
    '可安全重复轮询；任务结果保留 24 小时。',
  inputSchema: {
    type: 'object',
    required: ['taskId'],
    properties: {
      taskId: { type: 'string', description: 'submit_asr_job 返回的任务 ID' },
    },
  },
  outputSchema: {
    type: 'object', additionalProperties: true,
    properties: {
      requestId: { type: 'string' },
      taskId: { type: 'string' },
      status: { type: 'string', enum: ['queued', 'running', 'done', 'failed'] },
      text: { type: 'string', description: 'status=done 时返回' },
      duration: { type: 'number', nullable: true },
      segments_done: { type: 'integer', description: '轮询进度' },
      processed_s: { type: 'number', description: '已处理秒数' },
      segments: { type: 'array', items: { type: 'object', additionalProperties: true } },
      engine: { type: 'string' },
      error: { type: 'string', description: 'status=failed 时返回，额度已自动返还' },
    },
  },
  zodSchema: z.object({ taskId: z.string().min(1, 'taskId 必填') }),
  async handler(args) {
    return api.asrGet(args.taskId);
  },
};
