import { z } from 'zod';
import { api } from '../lib/apiClient.js';

export const getAccountTool = {
  name: 'get_account',
  title: '查询额度与账户状态',
  description:
    '查询当前令牌的应用档位（free/paid）、各能力当日额度用量（tts/asr/ocr 的 used/limit/remaining）、' +
    '额度重置时间与许可证有效期。只读，不消耗额度。',
  inputSchema: { type: 'object', properties: {} },
  zodSchema: z.object({}),
  async handler() {
    return api.getAccount();
  },
};
