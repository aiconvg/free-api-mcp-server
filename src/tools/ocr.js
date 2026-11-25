import { z } from 'zod';
import { api } from '../lib/apiClient.js';

export const ocrTool = {
  name: 'ocr_image',
  title: '图片文字识别',
  description:
    '识别单张图片（png/jpg/webp，≤ 8MB）中的文字，返回 fullText 与分块（含置信度/坐标）。' +
    '计费工具（占 1 次当日 OCR 额度，失败不扣）。imageUrl 必须是公网可访问 URL；' +
    '本地文件路径无法使用。mode=full 只出全文，structured 出带坐标分块。',
  inputSchema: {
    type: 'object',
    required: ['imageUrl'],
    properties: {
      imageUrl: { type: 'string', description: '图片公网 URL，≤ 8MB' },
      mode: { type: 'string', enum: ['auto', 'full', 'structured'], description: '默认 auto' },
    },
  },
  zodSchema: z.object({
    imageUrl: z.string().url('imageUrl 必须是 http(s) 公网 URL'),
    mode: z.enum(['auto', 'full', 'structured']).optional(),
  }),
  async handler(args) {
    return api.ocr(args);
  },
};
