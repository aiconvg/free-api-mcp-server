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
  zodSchema: z.object({ taskId: z.string().min(1, 'taskId 必填') }),
  async handler(args) {
    return api.asrGet(args.taskId);
  },
};
