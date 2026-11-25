import { z } from 'zod';
import { api } from '../lib/apiClient.js';

// ── 视频链接转文字（积分计费 · /v1/video/transcribe，2026-11-06 接入 MCP）──
// 计费口径：转写稿每 5 字 1 积分；提交后按「时长 × 保守字速」冻结，
// 按实际字数结算、估少补扣、失败全额解冻（上游 videoBilling 统一执行）。

export const videoSubmitTool = {
  name: 'submit_video_transcribe',
  title: '提交视频链接转文字',
  description:
    '把短视频/视频链接转成带时间轴的转写稿。支持抖音（含 v.douyin.com 分享短链、可直接粘整段分享文案）、' +
    'bilibili/b23.tv、YouTube、快手、小红书、TikTok。立即返回 taskId，用 get_video_transcribe 轮询' +
    '（建议每 10 秒，1~2 分钟短视频通常 1 分钟内完成，不要无限轮询）。' +
    '计费工具：转写稿每 5 字 1 积分，提交时按时长冻结积分（约 2 积分/秒），' +
    '完成按实际字数结算、失败全额解冻；积分不足会在任务中失败并退回冻结。失败不自动重试。',
  inputSchema: {
    type: 'object',
    required: ['url'],
    properties: {
      url: { type: 'string', description: '视频链接（平台分享短链或完整链接，也可传整段分享文案，服务端自动提取）' },
    },
  },
  zodSchema: z.object({
    url: z.string().min(8, 'url 必填').max(600, 'url 过长（如为分享文案请只保留链接所在文案 ≤600 字符）'),
  }),
  async handler(args) {
    return api.videoSubmit(args.url);
  },
};

export const videoGetTool = {
  name: 'get_video_transcribe',
  title: '查询视频转写任务结果',
  description:
    '按 taskId 查询视频转写任务：queued/downloading/transcribing/correcting（进行中）→ ' +
    'done（返回 text 转写稿、markdown 分段稿、chars 字数、credits 实扣积分）或 failed（error 字段，冻结已全额解冻）。' +
    '不计费、可安全重复轮询。',
  inputSchema: {
    type: 'object',
    required: ['taskId'],
    properties: { taskId: { type: 'string', description: 'submit_video_transcribe 返回的任务 ID' } },
  },
  zodSchema: z.object({ taskId: z.string().min(1, 'taskId 必填') }),
  async handler(args) {
    return api.videoGet(args.taskId);
  },
};
