# free-api MCP Server

把免费 / 付费的 **TTS · ASR · OCR · 多角色配音 · 视频转文字** 开放能力，以标准 MCP 工具暴露给任意 MCP 客户端（Trae / Claude / Cursor / 魔搭 Playground 等）。

本服务是纯协议适配层：不存数据、不发牌、不做计费；上游为 `https://www.open-api.aiconvg.xin`，额度与计费都在上游按你的令牌结算。

## 特性

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

## 许可

MIT，见 [LICENSE](LICENSE)。
