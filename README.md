# free-api MCP Server

把免费 / 付费的 **TTS · ASR · OCR · 多角色配音 · 视频转文字** 开放能力，以标准 MCP 工具暴露给任意 MCP 客户端（Trae / Claude / Cursor / 魔搭 Playground 等）。

本服务是纯协议适配层：不存数据、不发牌、不做计费；上游为 `https://www.free-api.aiconvg.xin`，额度与计费都在上游按你的令牌结算。

## 特性

- 运行于 Node.js，STDIO 协议（`npx -y free-api-mcp-server` 即可拉起）；托管到云函数（如魔搭 / 阿里云函数计算）后会自动转 SSE 并带平台鉴权。
- **游客默认可用（免注册）**：不填令牌也能直接试用（每实例 / 每 IP 每北京日 TTS 30 / ASR 15 / OCR 15 次）；填 `FREE_API_TOKEN` 解锁完整额度与高阶能力。
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

### 游客试用（免注册，默认可用）
不填任何令牌时自动进入游客模式（stdio 走内置游客试用令牌 `TRIAL_LICENSE_TOKEN[_FILE]`，HTTP 走内置试用令牌），开箱即用：
- 每 IP（远程）/ 每实例（stdio）**每北京日**：`text_to_speech` 30 次、`speech_to_text` 15 次、`ocr_image` 15 次；
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
        "FREE_API_BASE_URL": "https://www.free-api.aiconvg.xin",
        "FREE_API_TOKEN": "<你的许可证令牌>"
      }
    }
  }
}
```

| 环境变量 | 必填 | 说明 |
|---|---|---|
| `FREE_API_TOKEN` | ✅ | 你的许可证令牌（用户各自填写） |
| `FREE_API_BASE_URL` | ✅ | 固定 `https://www.free-api.aiconvg.xin` |
| `MCP_TRANSPORT` | 默认 stdio | 托管场景保持 stdio（平台自动转 SSE） |
| `LOG_LEVEL` | 可选 | `debug/info/warn/error`，默认 info；日志走 stderr，stdout 只承载协议 |

本地直跑：

```bash
FREE_API_TOKEN=<你的令牌> FREE_API_BASE_URL=https://www.free-api.aiconvg.xin npx -y free-api-mcp-server
```

## 调用示例

- `list_voices { "lang": "zh" }`
- `text_to_speech { "text": "你好，欢迎使用", "voice": "zh_CN-huayan-medium", "speed": 1.0 }` → 返回 `audioUrl`
- `speech_to_text { "audioUrl": "https://example.com/a.mp3" }`
- `ocr_image { "imageUrl": "https://example.com/a.png", "mode": "full" }`
- `dubbing_submit { "segments": [{ "voice": "...", "text": "第一句" }, { "voice": "...", "text": "第二句" }] }`
- `submit_video_transcribe { "url": "https://v.douyin.com/xxxx/" }` → `get_video_transcribe { "taskId": "..." }`

> `audioUrl` / `imageUrl` / 视频链接必须是**公网可访问 URL**，本地文件路径不支持。

## 额度与计费

- 游客试用（免注册）：每 IP / 每实例每北京日 TTS 30 / ASR 15 / OCR 15 次（ASR 仅同步 `speech_to_text` ≤60s；不含长音频 `submit_asr_job` / 配音 / 视频）。
- 免费档（正式令牌）：每日 TTS 100 / ASR 50 / OCR 50 次（`get_account` 可查 used/limit/remaining）。
- 付费能力：配音按音色单价/字、视频转写稿 5 字 1 积分；预占—结算，按实际结算，失败/取消全额解冻。
- 失败不扣：上游失败自动返还/解冻。

## 错误码

- `AUTH_REQUIRED`：令牌缺失/无效 → 引导注册。
- `INVALID_PARAM`：入参校验失败（本地拦截，不触上游）。
- `UPSTREAM_UNAVAILABLE`：上游网络不可达，稍后重试。

## 许可

MIT，见 [LICENSE](LICENSE)。
