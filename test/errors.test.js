#!/usr/bin/env node
// 错误文案单测：#3 对 502/503（UPSTREAM_UNAVAILABLE / UPSTREAM_OVERLOAD）统一「服务繁忙，请稍后重试」文案，retryAfter 透出；
// 且不影响其它码（QUOTA_EXCEEDED 仍带 resetAt、INVALID_PARAM 仍按工具）。用法：node test/errors.test.js
import { UpstreamError } from '../src/lib/apiClient.js';
import { errorToMcpContent } from '../src/lib/errors.js';

let failed = 0;
const check = (name, ok, detail = '') => {
  process.stdout.write(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ` — ${detail}` : ''}\n`);
  if (!ok) failed += 1;
};
const txt = (e, tool) => errorToMcpContent(e, { toolName: tool }).content[0].text;
const first = (s) => s.split('\n')[0];

// 1) 503 + JSON 信封（UPSTREAM_UNAVAILABLE + retryAfter + requestId）→ 统一繁忙文案 + retryAfter 透出
const t1 = txt(new UpstreamError({ code: 'UPSTREAM_UNAVAILABLE', message: '上游暂不可用', retryAfter: 3, requestId: 'r1' }, 503));
check('503/UPSTREAM_UNAVAILABLE → 服务繁忙 + retryAfter(3 秒)', t1.includes('服务繁忙，请稍后重试') && t1.includes('（retryAfter 3 秒）'), first(t1));
check('503 → 带 retryAfter: 3s 与 requestId', t1.includes('retryAfter: 3s') && t1.includes('requestId: r1'));
check('503 → 码保留 [UPSTREAM_UNAVAILABLE]', first(t1).startsWith('[UPSTREAM_UNAVAILABLE]'));

// 2) 503 + 空体（网关裸 503 → payload null → code INTERNAL_ERROR，但 httpStatus=503）→ 仍判繁忙，码纠正为 UPSTREAM_UNAVAILABLE
const e2 = new UpstreamError(null, 503);
check('空体前提 code=INTERNAL_ERROR', e2.code === 'INTERNAL_ERROR', e2.code);
const t2 = txt(e2);
check('503 空体 → 服务繁忙 + 码纠正 UPSTREAM_UNAVAILABLE', t2.includes('服务繁忙，请稍后重试') && first(t2).startsWith('[UPSTREAM_UNAVAILABLE]'), first(t2));
check('503 空体无 retryAfter → 不带 retryAfter 行', !t2.includes('retryAfter:'));

// 3) 502 + UPSTREAM_OVERLOAD + retryAfter → 服务繁忙（retryAfter 5 秒）
const t3 = txt(new UpstreamError({ code: 'UPSTREAM_OVERLOAD', message: '上游过载', retryAfter: 5 }, 502));
check('502/UPSTREAM_OVERLOAD → 服务繁忙 + retryAfter(5 秒)', first(t3) === '[UPSTREAM_OVERLOAD] 服务繁忙，请稍后重试（retryAfter 5 秒）', first(t3));

// 4) 502 + 空体 → 码纠正为 UPSTREAM_OVERLOAD
const t4 = txt(new UpstreamError(null, 502));
check('502 空体 → 服务繁忙 + 码 UPSTREAM_OVERLOAD', t4.includes('服务繁忙，请稍后重试') && first(t4).startsWith('[UPSTREAM_OVERLOAD]'), first(t4));

// 5) 网络不可达（apiClient 造 code=UPSTREAM_UNAVAILABLE,httpStatus=503）→ 也归繁忙文案
const t5 = txt(new UpstreamError({ code: 'UPSTREAM_UNAVAILABLE', message: '上游网络不可达，请稍后重试' }, 503));
check('网络不可达(UPSTREAM_UNAVAILABLE,503) → 服务繁忙', t5.includes('服务繁忙，请稍后重试'), first(t5));

// 6) 回归：QUOTA_EXCEEDED(429) 不受影响，仍带 resetAt、不出现「服务繁忙」
const t6 = txt(new UpstreamError({ code: 'QUOTA_EXCEEDED', message: '当日额度用尽', resetAt: '2026-11-26T00:00:00.000Z', quota: { capability: 'tts', used: 30, limit: 30 } }, 429), 'text_to_speech');
check('QUOTA_EXCEEDED 不受影响：含码 + resetAt，无「服务繁忙」', first(t6).startsWith('[QUOTA_EXCEEDED]') && t6.includes('resetAt: 2026-11-26T00:00:00.000Z') && !t6.includes('服务繁忙'), first(t6));

// 7) 回归：INVALID_PARAM 仍按工具提示
const t7 = txt(new UpstreamError({ code: 'INVALID_PARAM', message: 'bad' }, 400), 'ocr_image');
check('INVALID_PARAM 仍按工具(OCR)提示', t7.includes('OCR 入参不合法'), first(t7));

process.exit(failed ? 1 : 0);
