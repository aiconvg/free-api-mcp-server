import { z } from 'zod';
import { api } from '../lib/apiClient.js';

export const ttsTool = {
  name: 'text_to_speech',
  title: '文本转语音',
  description:
    '把文本合成为可播放的语音，同步返回 audioUrl（自带 exp/sig 的公网直链，可直接播放，默认 24 小时有效）。' +
    '计费工具（失败不扣）。text ≤ 300 字符（2026-11-09 收敛，付费音色硬限）；voice 必须来自 list_voices，不要猜测音色名；' +
    'format 当前仅支持 wav。engine 可选：默认 standard（免费音色，占日额度，wav 输出）；' +
    '"premium"（仅付费档）用商业音色（如 Cherry）按积分计费、不占日额度，音色以充值页商业音色目录为准。',
  inputSchema: {
    type: 'object',
    required: ['text', 'voice'],
    properties: {
      text: { type: 'string', maxLength: 300, description: '待合成文本，≤ 300 字符；超过请分段多次调用' },
      voice: { type: 'string', description: '音色 ID，必须来自 list_voices 的返回（premium 引擎不受此限，可用商业音色）' },
      speed: { type: 'number', minimum: 0.5, maximum: 2.0, description: '语速，0.5–2.0，默认 1.0（仅 standard）' },
      format: { type: 'string', enum: ['wav'], description: '音频格式，当前仅 wav' },
      engine: { type: 'string', enum: ['standard', 'premium'], description: '引擎：默认 standard（免费）；premium 需付费档，按积分计费' },
    },
  },
  outputSchema: {
    type: 'object', additionalProperties: true,
    properties: {
      requestId: { type: 'string' },
      audioUrl: { type: 'string' },
    },
  },
  zodSchema: z.object({
    // P1-5：zod 消息不再复述「≤300」数字，避免与 invalidParamHint 重复；具体上限只在 hint 出现一次。
    text: z.string().min(1, '不能为空').max(300, '超过长度上限，请分段多次调用'),
    voice: z.string().min(1, '必填（用 list_voices 查询）'),
    speed: z.number().min(0.5, '不得小于 0.5').max(2.0, '不得大于 2.0').optional(),
    format: z.enum(['wav']).optional(),
    engine: z.enum(['standard', 'premium']).optional(),
  }),
  async handler(args) {
    return api.tts(args);
  },
};
