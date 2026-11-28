# free-api MCP Server

Expose the free / paid **TTS · ASR · OCR · Multi-Character Dubbing · Video to Text** open capabilities to any MCP client (Trae / Claude / Cursor / ModelScope Playground, etc.) via a standard MCP tool.

This service is purely a protocol adaptation layer: it does not store data, issue licenses, or handle billing. The upstream is `https://www.open-api.aiconvg.xin`, and quotas and billing are settled with your token at the upstream.

## n8n / Dify integration guide

Want to use this MCP server inside **n8n** or **Dify**? Follow the step-by-step guide (MCP node setup, transport type, and common pitfalls):
👉 **https://www.free-api.aiconvg.xin/docs/open-api.html#s6-5**

## Features

- **Transport**: the hosted `/mcp` endpoint accepts **POST only** (Streamable HTTP) and does **not** provide SSE push: `GET`→405 (`Allow: POST`), `/sse`→404. Clients should not use `EventSource`/GET long connections for push.
- Runs on Node.js, using the STDIO protocol (`npx -y free-api-mcp-server` to start); when hosted on cloud functions (such as ModelScope / Alibaba Cloud Function Compute), it automatically switches to SSE and includes platform authentication.
- **Guest Mode (No Registration Required)**: For **remote** `/mcp` (Streamable HTTP) clients, no token is required for guest access—the server holds an internal trial token, allowing 30 TTS, 15 ASR, and 15 OCR requests per IP per Beijing day. For **local** `npx` public packages, **no** guest token is included (fail-closed); you must provide your own `FREE_API_TOKEN` (or configure `TRIAL_LICENSE_TOKEN[_FILE]` for self-hosted deployments), otherwise, the process will exit with an error. Filling in `FREE_API_TOKEN` unlocks full quota and advanced features.
- **Each user fills in their own license token** (`FREE_API_TOKEN`), with billing/quota attributed to individual accounts, without mutual interference.
- A total of **13 tools** (7 free capabilities + 6 paid capabilities).

## 13 Tools

| # | Tool | Group | Billing | Description |
|---|---|---|---|---|
| 1 | `list_voices` | Free | No | Available voice whitelist (free and open-source voices); must be checked before calling `text_to_speech` |
| 2 | `get_account` | Free | No | Plan (free/paid), daily quota usage, token validity period |
| 3 | `text_to_speech` | Free | Occupies free daily quota (no deduction on failure) | Text ≤ 300 characters → playable `audioUrl` (valid for 24 hours by default); `engine` can be standard/premium |
| 4 | `speech_to_text` | Free | Occupies free daily quota (no deduction on failure) | Synchronous short audio ≤60s / ≤8MB |
| 5 | `submit_asr_job` | Free | Occupies daily quota upon submission, automatically refunded on failure | Asynchronous long audio task, returns `taskId` |
| 6 | `get_asr_job` | Free | No | Polling long audio tasks (queued/running/done/failed) |
| 7 | `ocr_image` | Free | Occupies free daily quota (no deduction on failure) | Single image ≤8MB; `mode=auto/full/structured` |
| 8 | `list_dubbing_voices` | Paid·Dubbing | No (query is free) | Dubbing voice catalog, returns `creditsPerChar` |
| 9 | `dubbing_submit` | Paid·Dubbing | Charged per character based on voice price (no deduction on failure, full refund on cancellation) | Multi-character dubbing: `segments=[{voice,text}]`; small tasks are synchronous, large tasks return 202+`taskId` |
| 10 | `get_dubbing_task` | Paid·Dubbing | No | Polling dubbing tasks |
| 11 | `cancel_dubbing_task` | Paid·Dubbing | No | Cancel incomplete tasks, immediately unfreeze credits |
| 12 | `submit_video_transcribe` | Paid·Video | 5 characters = 1 credit (full refund on failure) | Douyin/Bilibili/YouTube/Kuaishou/Xiaohongshu/TikTok link or share text → `taskId` |
| 13 | `get_video_transcribe` | Paid·Video | No | Polling video transcription (returns text / markdown segments / word count / actual credits deducted) |

> "Free" = Standard engine, measured by daily free quota, no credits deducted; "Paid" = Charged by credits (dubbing by character, video by word count). Query/polling tools are free.
>
> **ASR Accuracy Note**: The standard engine ASR uses SenseVoice-Small (**automatic language recognition**, not forced or language-specific), which has accuracy limits for **technical terms, mixed Chinese-English recognition**, and short sentences/numbers. This is a **design trade-off for the free tier (not a bug)**. For higher recognition accuracy, please use the premium engine.

## Authentication and Configuration

### Guest Trial (No Registration Required)
- **Remote (hosted `/mcp`)**: Clients that do not fill in any token automatically enter guest mode (the server holds an internal trial token), allowing immediate use without a token, counted by public IP.
- **Local (public npm package)**: **No** guest trial token is included (fail-closed); stdio must provide `FREE_API_TOKEN`, or for self-hosted deployments, provide `TRIAL_LICENSE_TOKEN` (or `TRIAL_LICENSE_TOKEN_FILE`) to use as a guest, otherwise, the process will exit with an error, counted by local instance.
- Per IP (remote) / per instance (stdio) **per Beijing day**: `text_to_speech` 30 times, `speech_to_text` 15 times, `ocr_image` 15 times (resets at 00:00 Beijing time the next day);
- Guests are only allowed to use `list_voices`, `get_account` + the above 3 capabilities; `submit_asr_job` (long audio asynchronous), dubbing, and video **are not available** (to prevent bypassing);
- The truly reliable global limit is underpinned by the upstream 02 guest-specific token, with client-side counting serving as a secondary soft limit.

### Official Token (Higher Quota)
Go to **https://www.free-api.aiconvg.xin** to register and obtain a free license token (free tier offers 100 TTS, 50 ASR, and 50 OCR requests per day). Fill in `FREE_API_TOKEN`, and the quota/billing will be attributed to your respective account.

```json

{

  "mcpServers": {

    "free-api": {

      "command": "npx",

      "args": ["-y", "free-api-mcp-server"],

      "env": {

        "FREE_API_BASE_URL": "https://www.open-api.aiconvg.xin",

        "FREE_API_TOKEN": "<你的许可证令牌>"

      }

    }

  }

}

```
| Environment Variable | Required | Description |
|---|---|---|
| `FREE_API_TOKEN` | ✅ | Your license token (each user fills this out individually) |
| `FREE_API_BASE_URL` | ✅ | Fixed to `https://www.open-api.aiconvg.xin` |
| `MCP_TRANSPORT` | Default stdio | Keep as stdio for hosted scenarios (platform automatically converts to SSE) |
| `LOG_LEVEL` | Optional | `debug/info/warn/error`, default is info; logs go to stderr, stdout carries only the protocol |

Running locally:

```bash

FREE_API_TOKEN=<你的令牌> FREE_API_BASE_URL=https://www.open-api.aiconvg.xin npx -y free-api-mcp-server

```
## Example Calls

- `list_voices { "lang": "zh" }`
- `text_to_speech { "text": "你好，欢迎使用", "voice": "zh_CN-huayan-medium", "speed": 1.0 }` → returns `audioUrl`
- `speech_to_text { "audioUrl": "https://example.com/a.mp3" }`
- `ocr_image { "imageUrl": "https://example.com/a.png", "mode": "full" }`
- `dubbing_submit { "segments": [{ "voice": "...", "text": "第一句" }, { "voice": "...", "text": "第二句" }] }`
- `submit_video_transcribe { "url": "https://v.douyin.com/xxxx/" }` → `get_video_transcribe { "taskId": "..." }`

> `audioUrl` / `imageUrl` / video links must be **publicly accessible URLs**, local file paths are not supported.

## Quotas & Access

### Three Tiers of Quotas (Standard Engine, Free Requests, No Points Consumed)

| Tier | Text-to-Speech TTS | Speech-to-Text ASR | Optical Character Recognition OCR |
|---|---|---|---|
| **Guest (No Login Trial)** | 30 times/day | 15 times/day (single ≤60 seconds, synchronous recognition) | 15 times/day |
| **Registered User (Free)** | 100 times/day | 50 times/day | 50 times/day |
| **Paid User** | 200 times/day | 100 times/day | 100 times/day |

- The above are the daily free quotas for the **standard engine** and **do not consume points**; both REST and MCP access methods **share the same account, the same token, and the same quota**, without double deduction or omission.
- Each call response will return `quota` (`used` / `limit` / `remaining`), allowing you to check the remaining number of calls in real-time.
- The daily quota **automatically resets at 08:00 Beijing time** every day, no action required.

### Points and Quota Packages

- **Recharge**: 1 RMB = 10,000 points (log in and recharge using WeChat Pay).
- **Daily Quota Package**: 1 package = 1,000 points = **+50 additional calls** for the day (applicable to TTS / ASR / OCR, automatically deducted after the base free quota is exhausted); **maximum 2 packages (+100 calls) per person per day**, valid for the day, **resets at 08:00 the next day along with the quota**.
- **Premium Engine (paid)**: A commercial model with higher quality, charged by points, **does not consume free quotas**; available only to paid tiers. To enable, include `"engine":"premium"` in the request, otherwise, it uses the standard engine.
- **Paid Capabilities**: Multi-role dubbing is priced per voice character/word, and video transcription is 1 point per 5 characters; pre-occupy—settle, charged based on actual usage, full refund upon failure/cancellation.

### Registration and Purchase Process

1. Open the portal **https://www.free-api.aiconvg.xin** → **register** and complete **email verification** (same account system as the website).
2. After logging in, navigate to the top menu **"API Application"/"My API"** to self-service activate, obtaining `license_key` / `call_token` / `app_key` (displayed fully only once, please save immediately).
3. When making calls, place the entire `call_token` in the request header `Authorization: Bearer <your token>` (applies to both REST and MCP).
4. For more calls or stronger models: go to **"Recharge"** to purchase points (1 RMB = 10,000 points).When the free quota for the day is exhausted: Go to **"My API" → Quota Package** and exchange points for a daily quota package to **immediately restore** your quota without waiting for a reset.
For detailed parameters, error codes, and examples, see the "Integration Documentation" on the portal at **https://www.free-api.aiconvg.xin**.

> If you lose your token, don't worry. Simply re-verify your email in "My API" to **reissue the call token** (this does not reset your quota or affect your license).

## Error Codes

- `AUTH_REQUIRED`: Missing/invalid token → Guide to registration (includes registration link and `FREE_API_TOKEN` configuration example).
- `INVALID_PARAM`: Input parameter validation failed (intercepted locally, does not trigger upstream; provide specific prompts based on the tool).
- `QUOTA_EXCEEDED`: Daily quota exceeded → Response includes `resetAt`. For guests, the quota resets at **00:00 the next day** (Beijing time); for registered users, it resets at **08:00 Beijing time**. Register for a free account or purchase a daily quota package to continue.
- `UPSTREAM_OVERLOAD`: Upstream overload (502/503 busy) → Returns `[UPSTREAM_OVERLOAD] Service is busy, please try again later (retryAfter N seconds)`, retry after `retryAfter` seconds.
- `UPSTREAM_UNAVAILABLE`: Upstream network unreachable/temporarily unavailable, please try again later.

## Recent Changes

### 0.2.10 (2026-11-26)
- **Error Message De-duplication**: For `INVALID_PARAM`, when the upstream/local reason is already specific (field + constraint), the generic fallback hint is no longer appended—each reason is stated only once. A targeted hint is added solely for generic/empty messages. Structured fields (`retryAfter`, `resetAt`, `quota`, `requestId`) are preserved.
- **Localized Metadata**: Descriptions/metadata now match each platform's audience—English-first with Chinese for international channels (npm, GitHub, MCP Registry, Glama, skills.sh), Chinese-first for domestic ModelScope. This README is English-first, with the full Chinese version below.


### 0.2.9 (2026-11-26)
- **Release Fix (0.2.9)**: The previous `0.2.8` on npm was actually old content (`c04c9ad`, only some tools like account/voices/tts/server included `outputSchema`). This `0.2.9` repackages the full HEAD with all fixes—**all 13 tools now declare `outputSchema` and return `structuredContent` with results**, including OCR `conf/bbox`+`mode`, `get_account`→`ipHash`, etc.
- **Unified OCR Fields**: `blocks[].conf` (confidence 0–1) / `blocks[].bbox` (four-point coordinates `[[x,y],...]`), consistent with engine output; the old `confidence` / `box` fields are deprecated.
- **Three OCR `mode` Levels Effective**: `full` returns only `fullText` (with `blocks` empty), `structured` returns only `blocks` (with `fullText` empty), and `auto` returns both; filtered at the BFF `/v1/ocr` layer, consistent with REST and MCP.
- **Convention for Multiple Content Blocks**: Only read `content[0]` (pure JSON) or `structuredContent`, **do not** concatenate multiple content blocks (for guest trials, the second block is a "remaining attempts" prompt). Starting from this version, each tool returns `structuredContent` (same source as `content[0].text`).
- **Guest View for `get_account`**: `personal.ip` changed to `personal.ipHash` (first 12 characters of the sha256 hash of the client IP), no longer returning plaintext or subnet.
- **Full `outputSchema` Coverage**: All 13 tools now declare `outputSchema`, facilitating structured parsing by clients and platform review.
- **ASR Free Tier Accuracy Explanation**: The standard ASR engine is SenseVoice-Small (**automatic language recognition**, not forced/distinguished by language), which has an accuracy limit for **technical terms, mixed Chinese-English recognition**, and short sentences/numbers. This is a **design trade-off for the free tier (not a bug)**. For high-precision requirements, please use the premium engine.

## License

MIT, see [LICENSE](LICENSE).


---

> 以下是中文版说明（Chinese version below）。

# free-api MCP Server

把免费 / 付费的 **TTS · ASR · OCR · 多角色配音 · 视频转文字** 开放能力，以标准 MCP 工具暴露给任意 MCP 客户端（Trae / Claude / Cursor / 魔搭 Playground 等）。

本服务是纯协议适配层：不存数据、不发牌、不做计费；上游为 `https://www.open-api.aiconvg.xin`，额度与计费都在上游按你的令牌结算。

## 特性

- **传输方式**：托管 `/mcp` **仅接受 POST**（Streamable HTTP），**不提供 SSE 推送**：`GET`→405（响应头 `Allow: POST`），`/sse`→404；客户端不要用 `EventSource`/GET 长连当推送。
- 运行于 Node.js，STDIO 协议（`npx -y free-api-mcp-server` 即可拉起）；托管到云函数（如魔搭 / 阿里云函数计算）后会自动转 SSE 并带平台鉴权。
- **游客模式（免注册）**：**远程** `/mcp`（Streamable HTTP）客户端不填令牌即游客可用——服务端持内置试用令牌，每 IP 每北京日 TTS 30 / ASR 15 / OCR 15 次；**本地** `npx` 公开包**不内置**游客令牌，需自备 `FREE_API_TOKEN`（自建部署时也可配 `TRIAL_LICENSE_TOKEN[_FILE]`），否则启动报错退出。填 `FREE_API_TOKEN` 解锁完整额度与高阶能力。
- **每个用户填自己的许可证令牌**（`FREE_API_TOKEN`），计费/额度归属各自账户，互不影响。
- 共 **13 个工具**（7 个免费能力 + 6 个付费能力）。

## 13 个工具

| # | 工具 | 分组 | 计费 | 说明 |
|---|---|---|---|---|
| 1 | `list_voices` | 免费 | 否 | 可用音色白名单（免费开源音色）；调 `text_to_speech` 前必查 |
| 2 | `get_account` | 免费 | 否 | 档位（free/paid）、当日额度用量、令牌有效期 |
| 3 | `text_to_speech` | 免费 | 占免费日额度（失败不扣） | 文本≤300 字符 → 可播 `audioUrl`（默认 24h 有效）；`engine` 可选 standard/premium |
| 4 | `speech_to_text` | 免费 | 占免费日额度（失败不扣） | 同步短音频 ≤60s / ≤8MB |
| 5 | `submit_asr_job` | 免费 | 提交即占日额度，失败自动返还 | 长音频异步任务，返回 `taskId` |
| 6 | `get_asr_job` | 免费 | 否 | 轮询长音频任务（queued/running/done/failed） |
| 7 | `ocr_image` | 免费 | 占免费日额度（失败不扣） | 单图 ≤8MB；`mode=auto/full/structured` |
| 8 | `list_dubbing_voices` | 付费·配音 | 否（查询不计费） | 配音音色目录，返回 `creditsPerChar` |
| 9 | `dubbing_submit` | 付费·配音 | 按音色单价/字（失败不扣、取消全额解冻） | 多角色配音：`segments=[{voice,text}]`；小任务同步、大任务 202+`taskId` |
| 10 | `get_dubbing_task` | 付费·配音 | 否 | 轮询配音任务 |
| 11 | `cancel_dubbing_task` | 付费·配音 | 否 | 取消未完成任务，冻结积分立即解冻 |
| 12 | `submit_video_transcribe` | 付费·视频 | 转写稿 5 字 1 积分（失败全额解冻） | 抖音/B站/YouTube/快手/小红书/TikTok 链接或分享文案 → `taskId` |
| 13 | `get_video_transcribe` | 付费·视频 | 否 | 轮询视频转写（返回 text / markdown 分段 / 字数 / 实扣积分） |

> 「免费」= 标准引擎、按每日免费额度计量、不扣积分；「付费」= 按积分计费（配音按字、视频按字数）。查询/轮询类工具不计费。
>
> **ASR 准度说明**：标准引擎 ASR 为 SenseVoice-Small（**自语言识别 auto**，不强制/不区分语种），对**技术术语、中英混识**及短句/数字有准度上限，这是**免费档的设计取舍（非 bug）**；需要更高识别精度的场景请改用 premium 引擎。

## 鉴权与配置

### 游客试用（免注册）
- **远程（托管 `/mcp`）**：客户端不填任何令牌即自动进入游客模式（服务端持内置试用令牌），免令牌即用，按公网 IP 计数。
- **本地（公开 npm 包）**：**不内置**游客试用令牌（fail-closed）；stdio 必须自备 `FREE_API_TOKEN`，或自建部署时提供 `TRIAL_LICENSE_TOKEN`（或 `TRIAL_LICENSE_TOKEN_FILE`）才能以游客身份试用，否则进程启动即 fatal 退出，按本机实例计数。
- 每 IP（远程）/ 每实例（stdio）**每北京日**：`text_to_speech` 30 次、`speech_to_text` 15 次、`ocr_image` 15 次（次日北京 00:00 恢复）；
- 游客只放 `list_voices`、`get_account` + 上述 3 个能力；`submit_asr_job`（长音频异步）、配音、视频**不开放**（堵旁路）；
- 真正可靠的全局限额由上游 02 游客专用令牌兜底，客户端计数仅作二级软限。

### 正式令牌（更高额度）
到 **https://www.free-api.aiconvg.xin** 注册获取免费许可证令牌（免费档每日 TTS 100 / ASR 50 / OCR 50 次），填入 `FREE_API_TOKEN`，额度/计费归属各自账户。

```json
{
  "mcpServers": {
    "free-api": {
      "command": "npx",
      "args": ["-y", "free-api-mcp-server"],
      "env": {
        "FREE_API_BASE_URL": "https://www.open-api.aiconvg.xin",
        "FREE_API_TOKEN": "<你的许可证令牌>"
      }
    }
  }
}
```

| 环境变量 | 必填 | 说明 |
|---|---|---|
| `FREE_API_TOKEN` | ✅ | 你的许可证令牌（用户各自填写） |
| `FREE_API_BASE_URL` | ✅ | 固定 `https://www.open-api.aiconvg.xin` |
| `MCP_TRANSPORT` | 默认 stdio | 托管场景保持 stdio（平台自动转 SSE） |
| `LOG_LEVEL` | 可选 | `debug/info/warn/error`，默认 info；日志走 stderr，stdout 只承载协议 |

本地直跑：

```bash
FREE_API_TOKEN=<你的令牌> FREE_API_BASE_URL=https://www.open-api.aiconvg.xin npx -y free-api-mcp-server
```

## 调用示例

- `list_voices { "lang": "zh" }`
- `text_to_speech { "text": "你好，欢迎使用", "voice": "zh_CN-huayan-medium", "speed": 1.0 }` → 返回 `audioUrl`
- `speech_to_text { "audioUrl": "https://example.com/a.mp3" }`
- `ocr_image { "imageUrl": "https://example.com/a.png", "mode": "full" }`
- `dubbing_submit { "segments": [{ "voice": "...", "text": "第一句" }, { "voice": "...", "text": "第二句" }] }`
- `submit_video_transcribe { "url": "https://v.douyin.com/xxxx/" }` → `get_video_transcribe { "taskId": "..." }`

> `audioUrl` / `imageUrl` / 视频链接必须是**公网可访问 URL**，本地文件路径不支持。

## 额度 & 接入

### 三档额度（标准引擎，免费次数，不消耗积分）

| 档位 | 语音合成 TTS | 语音识别 ASR | 文字识别 OCR |
|---|---|---|---|
| **游客（免登录试用）** | 30 次/日 | 15 次/日（单条 ≤60 秒，同步识别） | 15 次/日 |
| **注册用户（免费）** | 100 次/日 | 50 次/日 | 50 次/日 |
| **付费用户** | 200 次/日 | 100 次/日 | 100 次/日 |

- 以上为**标准引擎**的每日免费次数，**不扣积分**；REST 与 MCP 两种接入方式**共用同一账户、同一张令牌、同一份额度**，混用不重复扣、不漏扣。
- 每次调用的响应会返回 `quota`（`used` / `limit` / `remaining`），可实时查看剩余次数。
- 每日额度**北京时间 08:00 自动重置**，无需任何操作。

### 积分与额度包

- **充值**：1 元 = 10,000 积分（登录后进入「充值」用微信支付）。
- **当日额度包**：1 包 = 1,000 积分 = 当日 **+50 次**调用（TTS / ASR / OCR 通用，基础免费次数用尽后自动抵扣）；**每人每日最多 2 包（+100 次）**，当日有效，**次日 08:00 随额度一起重置**。
- **付费引擎（premium）**：商业模型，质量更高，按积分计费、**不占免费次数**；仅付费档位可用。请求中传 `"engine":"premium"` 即启用，未传走标准引擎。
- **付费能力**：多角色配音按音色单价/字、视频转写稿 5 字 1 积分；预占—结算，按实际结算，失败/取消全额解冻。

### 注册与购买流程

1. 打开门户 **https://www.free-api.aiconvg.xin** → **注册**并完成**邮箱验证**（与网页同一账号体系）。
2. 登录后进入顶部导航 **「API 申请」/「我的 API」** 自助开通，一次性获取 `license_key` / `call_token` / `app_key` 三类凭证（仅完整展示一次，请立即保存）。
3. 调用时把 `call_token` **整串**放入请求头 `Authorization: Bearer <你的令牌>`（REST 与 MCP 通用）。
4. 需要更多次数或更强模型：进入 **「充值」** 购买积分（1 元 = 10,000 积分）。
5. 当天免费次数用尽：在 **「我的 API」→ 额度包** 用积分兑换当日额度包，**立即恢复**、无需等待重置。
6. 详细参数、错误码与示例见门户 **https://www.free-api.aiconvg.xin** 内的「接入文档」。

> 令牌丢失无需担心：在「我的 API」重新走一遍邮箱验证即可**重签调用令牌**（不重置额度、不影响许可证）。

## 错误码

- `AUTH_REQUIRED`：令牌缺失/无效 → 引导注册（附注册入口与 `FREE_API_TOKEN` 配置示例）。
- `INVALID_PARAM`：入参校验失败（本地拦截，不触上游；按工具给出针对性提示）。
- `QUOTA_EXCEEDED`：当日额度用尽 → 响应带 `resetAt`。游客按北京日界**次日 00:00** 恢复；注册用户按北京时间 **08:00** 重置。注册免费账号或购买当日额度包可继续。
- `UPSTREAM_OVERLOAD`：上游过载（502/503 繁忙）→ 返回 `[UPSTREAM_OVERLOAD] 服务繁忙，请稍后重试（retryAfter N 秒）`，按 `retryAfter` 稍后重试。
- `UPSTREAM_UNAVAILABLE`：上游网络不可达/暂不可用，稍后重试。

## 最近变更

### 0.2.10（2026-11-26）
- **错误文案去重**：`INVALID_PARAM` 上游/本地已给出具体原因（字段 + 约束）时不再追加通用兜底提示，同一原因只说一次；仅泛化/空 message 才补针对性 hint。`retryAfter` / `resetAt` / `quota` / `requestId` 等结构字段保留。
- **描述国际化**：各平台元数据按地域适配语种——国际渠道（npm / GitHub / MCP Registry / Glama / skills.sh）英文为主兼容中文，国内魔搭保持中文为主。本 README 英文在前，中文全文见后。


### 0.2.9（2026-11-26）
- **发布修正（0.2.9）**：npm 上此前的 `0.2.8` 实为旧内容（`c04c9ad`，仅 account/voices/tts/server 等部分工具带 `outputSchema`）。本 `0.2.9` 打包 HEAD 全量修复重发——**13 个工具全部声明 `outputSchema` 并随结果返回 `structuredContent`**，OCR `conf/bbox`+`mode`、`get_account`→`ipHash` 等一并生效。
- **OCR 字段统一**：`blocks[].conf`（置信度 0–1）/ `blocks[].bbox`（四点坐标 `[[x,y],...]`），与引擎返回一致；旧文档的 `confidence` / `box` 作废。
- **OCR `mode` 三档生效**：`full` 只回 `fullText`（`blocks` 为空）、`structured` 只回 `blocks`（`fullText` 为空）、`auto` 两者都回；在 BFF `/v1/ocr` 层过滤，REST 与 MCP 一致。
- **多 content 块取值约定**：只读 `content[0]`（纯 JSON）或 `structuredContent`，**不要**拼接多个 content 块（游客试用时第二块是「剩余次数」提示）。本版起每个工具都随结果返回 `structuredContent`（与 `content[0].text` 同源）。
- **`get_account` 游客视图**：`personal.ip` 改为 `personal.ipHash`（客户端 IP 的 sha256 前 12 位），不再回传明文或网段。
- **`outputSchema` 全覆盖**：13 个工具全部声明 `outputSchema`，便于客户端结构化解析与平台审核。
- **ASR 免费档准度说明**：标准引擎 ASR 为 SenseVoice-Small（**自语言识别 auto**，不强制/不区分语种），对**技术术语、中英混识**及短句/数字有准度上限，这是**免费档的设计取舍（非 bug）**；对精度要求高的场景请改用 premium 引擎。

## 许可

MIT，见 [LICENSE](LICENSE)。
