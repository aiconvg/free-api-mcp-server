import { z } from 'zod';
import { api } from '../lib/apiClient.js';

export const asrSyncTool = {
  name: 'speech_to_text',
  title: '语音转文字（同步，短音频）',
  description:
    '转写 ≤ 60 秒、≤ 8MB 的短音频，同步返回文本与分段。计费工具（占 1 次当日 ASR 额度，失败不扣）。' +
    'audioUrl 必须是公网可访问 URL（wav/mp3/m4a）；本地文件路径无法使用。' +
    '更长的音频改用 submit_asr_job 提交异步任务。',
  inputSchema: {
    type: 'object',
    required: ['audioUrl'],
    properties: {
      audioUrl: { type: 'string', description: '音频公网 URL，≤ 8MB 且 ≤ 60 秒' },
      lang: { type: 'string', description: '语种，auto 自动判定（默认）' },
      engine: { type: 'string', enum: ['standard', 'premium'], description: '引擎：默认 standard（免费）；premium 需付费档，商业模型按积分计费' },
    },
  },
  zodSchema: z.object({
    audioUrl: z.string().url('audioUrl 必须是 http(s) 公网 URL'),
    lang: z.string().optional(),
    engine: z.enum(['standard', 'premium']).optional(),
  }),
  async handler(args) {
    return api.asrSync(args);
  },
};
