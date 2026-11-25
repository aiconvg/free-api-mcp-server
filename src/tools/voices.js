import { z } from 'zod';
import { api } from '../lib/apiClient.js';

function normLang(s) { return String(s || '').trim().toLowerCase().replace(/-/g, '_'); }

export const listVoicesTool = {
  name: 'list_voices',
  title: '列出可用音色',
  description:
    '获取 TTS 可用音色列表（仅免费开源音色，不计额度）。调用 text_to_speech 前必须先从这里拿 voice 参数，' +
    '直接猜测音色名会返回 VOICE_NOT_ALLOWED。不传 lang 返回全部；传 lang 按语言前缀过滤（zh→zh_CN、en→en_US…；matcha/fanchen 归 zh_CN）。',
  inputSchema: {
    type: 'object',
    properties: {
      lang: { type: 'string', description: '按语言筛选（前缀匹配），如 zh / en / ja；不传则返回全部音色' },
    },
  },
  outputSchema: {
    type: 'object', additionalProperties: true,
    properties: {
      requestId: { type: 'string' },
      count: { type: 'number' },
      voices: { type: 'array', items: { type: 'object', additionalProperties: true } },
    },
  },
  zodSchema: z.object({ lang: z.string().optional() }),
  async handler(args) {
    const res = await api.listVoices(); // { requestId, voices:[{voice,name,lang,format,engine}], count, note }
    const q = normLang(args?.lang);
    if (!q) return res;
    const all = Array.isArray(res?.voices) ? res.voices : [];
    const voices = all.filter((v) => {
      const l = normLang(v?.lang);
      return l === q || l.split('_')[0] === q || l.startsWith(q + '_');
    });
    return {
      ...res,
      voices,
      count: voices.length,
      lang: args.lang,
      note: `${res?.note ? res.note + '；' : ''}已按 lang=${args.lang} 过滤（前缀匹配）`,
    };
  },
};
