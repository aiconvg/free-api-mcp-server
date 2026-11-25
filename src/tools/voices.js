import { z } from 'zod';
import { api } from '../lib/apiClient.js';

export const listVoicesTool = {
  name: 'list_voices',
  title: '列出可用音色',
  description:
    '获取 TTS 可用音色列表（仅免费开源音色，不计额度）。调用 text_to_speech 前必须先从这里拿 voice 参数，' +
    '直接猜测音色名会返回 VOICE_NOT_ALLOWED。',
  inputSchema: {
    type: 'object',
    properties: {
      lang: { type: 'string', description: '按语言筛选，如 zh / en / ja，默认 zh' },
    },
  },
  zodSchema: z.object({ lang: z.string().optional() }),
  async handler(args) {
    return api.listVoices(args?.lang);
  },
};
