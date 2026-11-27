# Installing free-api Media (for AI coding agents like Cline)

free-api Media exposes **13 MCP tools**: text-to-speech (multi-voice), speech-to-text (short sync + long async), OCR, multi-voice dubbing, and video-link-to-text (Douyin / Bilibili / YouTube / Kuaishou / Xiaohongshu / TikTok).

## Option A (recommended): Remote hosted server — no install
- URL: `https://www.open-api.aiconvg.xin/mcp`
- Transport: **Streamable HTTP, POST-only** (no SSE; `GET` -> 405 is expected).
- Auth: optional `Authorization: Bearer <FREE_API_TOKEN>`. Without a token the server runs a per-IP guest trial (30 TTS / 15 ASR / 15 OCR per Beijing day).

Cursor / VS Code `mcp.json`:
```json
{ "mcpServers": { "free-api": { "url": "https://www.open-api.aiconvg.xin/mcp" } } }
```

## Option B: Local stdio via npm
```bash
npx -y free-api-mcp-server
```
This package is **fail-closed**: it **requires** the env var `FREE_API_TOKEN`, otherwise the process exits with an error by design. Get a free token (100 TTS / 50 ASR / 50 OCR per day) at https://www.free-api.aiconvg.xin .

```json
{ "mcpServers": { "free-api": {
  "command": "npx", "args": ["-y", "free-api-mcp-server"],
  "env": { "FREE_API_TOKEN": "<your token>" } } } }
```

## Verify
1. Call `list_voices` (must be called before `text_to_speech`).
2. Call `get_account` to confirm plan/quota.
3. `text_to_speech` with a short string -> returns a playable `audioUrl`.

## Troubleshooting
- `GET` on `/mcp` returns 405 in remote mode — expected, use POST.
- Local package exits immediately — `FREE_API_TOKEN` missing.
- ASR accuracy on technical terms / mixed zh-en is a known free-tier trade-off (SenseVoice-Small); use `engine=premium` for higher accuracy.
