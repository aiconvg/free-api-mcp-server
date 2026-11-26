import { z } from 'zod';
import { api } from '../lib/apiClient.js';

export const ocrTool = {
  name: 'ocr_image',
  title: '图片文字识别',
  description:
    '识别单张图片（png/jpg/webp，≤ 8MB）中的文字，返回 fullText 与分块（含置信度 conf/坐标 bbox）。' +
    '计费工具（占 1 次当日 OCR 额度，失败不扣）。imageUrl 必须是公网可访问 URL；' +
    '本地文件路径无法使用。mode=full 只出全文（blocks 为空），structured 只出带 conf/bbox 的分块（fullText 为空），auto 两者都出。' +
    '结果取值：读 content[0]（纯 JSON）或 structuredContent，不要把多个 content 块拼接。',
  inputSchema: {
    type: 'object',
    required: ['imageUrl'],
    properties: {
      imageUrl: { type: 'string', description: '图片公网 URL，≤ 8MB' },
      mode: { type: 'string', enum: ['auto', 'full', 'structured'], description: '默认 auto（两者都出）；full 只全文；structured 只分块' },
    },
  },
  outputSchema: {
    type: 'object', additionalProperties: true,
    properties: {
      requestId: { type: 'string' },
      fullText: { type: 'string', description: '整图拼接全文；mode=structured 时为空串' },
      blocks: {
        type: 'array',
        description: '分块结果；mode=full 时为空数组。每块含 text/conf/bbox',
        items: {
          type: 'object',
          properties: {
            text: { type: 'string' },
            conf: { type: 'number', description: '置信度 0–1' },
            bbox: { type: 'array', description: '四点坐标 [[x,y],...]', items: { type: 'array', items: { type: 'number' } } },
          },
        },
      },
      engine: { type: 'string' },
      mode: { type: 'string', enum: ['auto', 'full', 'structured'] },
      quota: { type: 'object', additionalProperties: true },
    },
  },
  zodSchema: z.object({
    imageUrl: z.string().url('必须是 http(s) 公网 URL'),
    mode: z.enum(['auto', 'full', 'structured']).optional(),
  }),
  async handler(args) {
    return api.ocr(args);
  },
};
