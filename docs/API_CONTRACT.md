# API Contract (tranlation-overlay-extension)

Last Updated: 2026-02-19

## 1. Scope
This document records API contracts used by `tranlation-overlay-extension` runtime code (excluding demo/example-only files).

- Grouping rule: first-level grouped by domain prefix.
- Contract rule: for each API, define request fields/types and expected response fields/types.
- Change rule: any API request/response shape change must update this document in the same PR.

## 2. Domain Index

| Domain Prefix | Main Usage |
|---|---|
| `${AUTH_BASE_ORIGIN}` (default `https://side-translation.planktonfly.com`) | auth, signed proxy APIs, Google translate proxy endpoints |
| `${WORDCARD_API_ENDPOINT}` (default `https://side-translation.planktonfly.com/wordcard`) | word card dictionary query |
| `${LLM_API_ENDPOINT}` (user config) e.g. `https://api.openai.com`, `https://api.deepseek.com`, `https://api.siliconflow.cn`, `https://api.anthropic.com` | LLM translation/AI meaning |
| Google Gemini SDK target (default Google Generative Language service; optional custom `baseUrl`) | Gemini provider calls |
| `https://texttospeech.googleapis.com` | full-text TTS synthesis |
| `https://api.dictionaryapi.dev` | phonetic and meanings |
| `https://dict.youdao.com` | Youdao TTS audio |
| `https://api.github.com` | latest release check |
| `https://storage.planktonfly.com` | Firefox extension update manifest |
| `${VITE_WS_LOG_SERVER}` (optional ws/wss) | debug log websocket |

## 3. `${AUTH_BASE_ORIGIN}` APIs
`AUTH_BASE_ORIGIN = VITE_AUTH_SERVER_URL || origin(AuthConfig.authEndpoint)`

### 3.1 POST `/auth_token`
Used by auth token refresh.

Request headers:

| Field | Type | Required | Notes |
|---|---|---|---|
| `Content-Type` | `"application/json"` | yes | no body is sent, header is still set |
| `x-temp-id` | `string` | yes | local temp identity |
| `x-extension-id` | `string` | yes | extension id |
| `x-extension-version` | `string` | yes | manifest version without dots |
| `x-timestamp` | `string` | yes | unix seconds |
| `x-user-id` | `string` | no | empty allowed |
| `Authorization` | `Bearer <token>` | conditional | present for normal refresh |
| `x-init-salt` | `string` | conditional | present when force-new token path |

Request body: none.

Expected success response JSON:

| Field | Type | Required |
|---|---|---|
| `token` | `string` | yes |
| `expires_in` | `number` | yes |
| `check_interval` | `number` | yes |

Expected error response:

| Field | Type | Required | Notes |
|---|---|---|---|
| `error` | `string` | recommended | if absent, client falls back to raw text snippet |

### 3.2 Signed API wrapper (for relative and absolute URLs via `httpClient`)
Applies to calls made by `RequestInterceptor`.

Injected headers:

| Field | Type |
|---|---|
| `Authorization` | `Bearer <token>` |
| `x-user-id` | `string` |
| `x-temp-id` | `string` |
| `x-timestamp` | `string` |
| `x-nonce` | `string` |
| `x-extension-id` | `string` |
| `x-extension-version` | `string` |
| `x-sign` | `string` |

If request body is object: serialized to JSON and `Content-Type: application/json`.

401 special handling:

| Field | Type | Behavior |
|---|---|---|
| `action` | `"refresh_token"` | client refreshes token and retries |

### 3.3 POST `/api/register`
Used by options auth UI.

Request (`application/json`):

| Field | Type | Required |
|---|---|---|
| `username` | `string` | yes |
| `email` | `string` | yes |
| `password` | `string` | yes |
| `confirm_password` | `string` | yes |

Response: JSON object (shape is server-defined). UI accepts success on HTTP 2xx.

Error response (preferred):

| Field | Type |
|---|---|
| `error` | `string` |
| `message` | `string` |

### 3.4 POST `/auth/local/login`
Used by options auth UI.

Request (`application/x-www-form-urlencoded`):

| Field | Type | Required |
|---|---|---|
| `user` | `string` | yes |
| `passwd` | `string` | yes |

Request option: `credentials: include`.

Expected success response fields used by client:

| Field | Type | Required | Notes |
|---|---|---|---|
| `id` | `string \| number` | recommended | fallback is login identity |
| `name` | `string` | recommended | fallback is login identity |
| `picture` | `string` | optional | avatar URL |

Error response (preferred): `error` or `message` string.

### 3.5 GET `/translate_tts`
Google TTS proxy endpoint used by word/paragraph/word-card TTS.

Query params:

| Field | Type | Required | Example |
|---|---|---|---|
| `ie` | `string` | yes | `UTF-8` |
| `client` | `string` | yes | `gtx` |
| `tl` | `string` | yes | `en-US` / `en-GB` / `en` |
| `q` | `string` | yes | text to speak |

Expected response:

| Field | Type | Required |
|---|---|---|
| response body | `binary (audio blob)` | yes |

Failure handling: non-2xx or empty blob is treated as failed audio.

### 3.6 GET `/translate_a/single`
Google Translate private API proxy endpoint used by quick translation helper.

Query params:

| Field | Type | Required | Example |
|---|---|---|---|
| `client` | `string` | yes | `gtx` |
| `sl` | `string` | yes | `auto` |
| `tl` | `string` | yes | `zh-CN` |
| `dt` | `string` | yes | `t` |
| `q` | `string` | yes | text |

Expected response shape consumed by client:

| Field | Type | Required | Notes |
|---|---|---|---|
| `[0]` | `array` | yes | translation segments |
| `[0][i][0]` | `string` | yes | translated segment text |
| `[2]` | `string` | optional | detected source language |

## 4. `${WORDCARD_API_ENDPOINT}` APIs
Default endpoint from settings: `https://side-translation.planktonfly.com/wordcard`.

### 4.1 GET `/health`
Request: no body.

Expected response: any 2xx means healthy (body unused).

### 4.2 GET `/api/v2/entries/{language}/{word}`
Used by word card dictionary.

Headers:

| Field | Type | Required |
|---|---|---|
| `Accept` | `"application/json"` | yes |

Path params:

| Field | Type |
|---|---|
| `language` | `string` (default `en`) |
| `word` | `string` (URL encoded) |

Expected response JSON (`DictionaryResponse`):

| Field | Type | Required |
|---|---|---|
| `word` | `string` | yes |
| `phonetics` | `{ uk: string, us: string }` | yes |
| `audio` | `{ uk: string, us: string }` | yes |
| `translations` | `Array<{ pos: string, meanings: string[] }>` | yes |
| `definitions` | `Array<{ partOfSpeech: string, definition: string, example: string, synonyms: string[], antonyms: string[] }>` | yes |
| `exchange` | `{ past: string, pastParticiple: string, presentParticiple: string, thirdPerson: string, plural: string, comparative: string, superlative: string, lemma: string }` | yes |
| `frequency` | `{ collins: number, oxford: number, bnc: number, frq: number, tag: string[] }` | yes |
| `source` | `string` | yes |
| `cached` | `boolean` | yes |
| `detailUrl` | `string` | yes |

Error behavior:

| HTTP | Client behavior |
|---|---|
| `404` | treated as word-not-found |
| other non-2xx | treated as API error |

Word-card rendering contract (client-side behavior bound to this schema):

1. `definitions[].definition` is rendered as escaped plain text, never injected as raw HTML.
2. For non-English query languages, pronunciation UI uses a generic `Pronunciation` label (no fixed `US/UK` tags).
3. Definition section title is selected by `language/source` (`enEn`, `jaEn`, `koEn`, `deEn`, `ruEn`, or generic `definitions`) instead of always forcing English-English title.
4. For English queries, whether to show the definitions section is controlled by `showEnglishDefinition` setting.
5. For some non-English dictionary sources that merge multiple senses into one long entry, client may split the plain text heuristically for display only; response schema remains unchanged.

## 5. `${LLM_API_ENDPOINT}` (OpenAI-compatible HTTP)
Used by `OpenAIProvider`, `UniversalApiService.callHttpApi`, and API connection test.

Typical endpoints by default config:

- `https://api.openai.com/v1/chat/completions`
- `https://api.deepseek.com/v1/chat/completions`
- `https://api.siliconflow.cn/v1/chat/completions`
- UI can also set `https://api.anthropic.com/v1/messages` or custom endpoint.

Note:

- Current runtime request body remains OpenAI-compatible (`model + messages + temperature + max_tokens`), even for non-OpenAI domains.

Request headers:

| Field | Type | Required |
|---|---|---|
| `Content-Type` | `"application/json"` | yes |
| `Authorization` | `Bearer <apiKey>` | yes |
| `site_auth` | `string` | optional |
| `site_api` | `string` | optional |

Request body fields:

| Field | Type | Required | Notes |
|---|---|---|---|
| `model` | `string` | yes | |
| `messages` | `Array<{ role: "system"\|"user"\|"assistant", content: string }>` | yes | |
| `temperature` | `number` | yes | |
| `max_tokens` | `number` | optional | |
| `enable_thinking` | `boolean` | conditional | included only when `includeThinkingParam` enabled |
| `x_user_level` | `number` | optional | added in `OpenAIProvider` translation flow |
| `x_page_session_id` | `string` | optional | auto-injected by extension for `/v1/chat/completions`; stable per page session |
| `x_page_request_seq` | `number` | optional | auto-injected by extension for `/v1/chat/completions`; starts at `1` and increments per page session |
| custom merged params | `object` | optional | from `customParams` JSON |

Page-first request metadata behavior:

1. Extension injects `x_page_session_id` + `x_page_request_seq` only for endpoints containing `/v1/chat/completions`.
2. When page URL changes, extension resets page session and restarts sequence from `1`.
3. If request payload already contains both fields (e.g. retry path), extension keeps original values.
4. `x_*` metadata is extension/server internal and should not be forwarded to upstream LLM providers.

Expected response fields consumed by client:

| Field | Type | Required | Notes |
|---|---|---|---|
| `choices[0].message.content` | `string` | yes | main text payload |
| `usage.prompt_tokens` | `number` | optional | |
| `usage.completion_tokens` | `number` | optional | |
| `usage.total_tokens` | `number` | optional | |
| `error.message` | `string` | optional | for error display |

Additional translation-format constraint (`OpenAIProvider`):

- `choices[0].message.content` should be line-based `original||translation` pairs for parser stability.

## 6. Google Gemini SDK Target Domain
Used by `GoogleGeminiProvider` and `UniversalApiService.callGoogleGemini` via `@google/generative-ai` SDK.

Domain behavior:

- Default SDK endpoint: Google Generative Language service.
- If `apiEndpoint` configured, it is passed as SDK `baseUrl` (proxy/custom gateway mode).

Input contract (SDK call level):

| Field | Type | Required |
|---|---|---|
| `model` | `string` | yes |
| `prompt` | `string` | yes |
| `generationConfig.temperature` | `number` | yes |
| `generationConfig.maxOutputTokens` | `number` | optional |
| other generation params | `object` | optional (from custom params) |

Expected response fields consumed:

| Field | Type | Required |
|---|---|---|
| `response.text()` | `string` | yes |
| `response.usageMetadata.promptTokenCount` | `number` | optional |
| `response.usageMetadata.candidatesTokenCount` | `number` | optional |
| `response.usageMetadata.totalTokenCount` | `number` | optional |

Additional translation-format constraint (`GoogleGeminiProvider`):

- `response.text()` should contain line-based `original||translation` pairs.

## 7. `texttospeech.googleapis.com` APIs

### 7.1 POST `/v1beta1/text:synthesize?key={apiKey}`
Used by full-text TTS provider and TTS config test.

Request headers:

| Field | Type |
|---|---|
| `Content-Type` | `"application/json; charset=utf-8"` |

Request body (`synthesize`):

| Field | Type | Required |
|---|---|---|
| `input.ssml` or `input.text` | `string` | yes |
| `voice.languageCode` | `string` | yes |
| `voice.name` | `string` | yes |
| `audioConfig.audioEncoding` | `"MP3"\|"OGG_OPUS"\|"LINEAR16"` | yes |
| extra `voice/*` and `audioConfig/*` | `object` | optional via custom params |

Expected response:

| Field | Type | Required |
|---|---|---|
| `audioContent` | `string` (base64) | yes |
| `timepoints` | `Array<{ markName: string, timeSeconds: number, type: "SSML_MARK" }>` | optional |
| `error.code` | `number` | optional |
| `error.message` | `string` | optional |
| `error.status` | `string` | optional |

## 8. `api.dictionaryapi.dev` APIs

### 8.1 GET `/api/v2/entries/en/{word}`
Used by pronunciation phonetic provider.

Request headers:

| Field | Type |
|---|---|
| `Accept` | `"application/json"` |
| `User-Agent` | `string` |
| `Referer` | `string` |

Expected response consumed (first array entry only):

| Field | Type | Required |
|---|---|---|
| `[0].phonetics[]` | `Array<{ text?: string, audio?: string, sourceUrl?: string }>` | optional |
| `[0].meanings[]` | `Array<{ partOfSpeech: string, definitions: Array<{ definition: string, example?: string, synonyms?: string[] }> }>` | optional |

### 8.2 HEAD `/api/v2/entries/en/hello`
Used for availability check. `200` or `404` is considered available.

## 9. `dict.youdao.com` APIs

### 9.1 GET `/dictvoice`
Used by Youdao TTS provider.

Query params:

| Field | Type | Required | Notes |
|---|---|---|---|
| `type` | `1 \| 2` | yes | `1=UK`, `2=US` |
| `audio` | `string` | yes | text |

Expected response: audio binary stream playable by audio layer.

## 10. `api.github.com` APIs

### 10.1 GET `/repos/xiao-zaiyi/illa-helper/releases/latest`
Used by update check service.

Request headers:

| Field | Type |
|---|---|
| `Accept` | `"application/vnd.github+json"` |
| `User-Agent` | `"side-translation"` |

Expected response fields consumed:

| Field | Type | Required |
|---|---|---|
| `tag_name` | `string` | yes |
| `name` | `string` | optional |
| `body` | `string` | optional |
| `html_url` | `string` | yes |
| `published_at` | `string` | yes |
| `prerelease` | `boolean` | yes |
| `draft` | `boolean` | yes |
| `assets` | `Array<{ name: string, browser_download_url: string, size: number, content_type: string }>` | optional |

## 11. `storage.planktonfly.com` (Browser-managed)

### 11.1 GET `/updates/update.json`
Declared in Firefox `update_url` manifest config.

- Caller: Firefox extension update mechanism (browser, not app business code).
- Expected response: Firefox update manifest JSON format.

## 12. `${VITE_WS_LOG_SERVER}` WebSocket (optional)

### 12.1 WS/WSS log stream
Used by `Report.ts` for debug log upload.

Client outbound message schema (`LogEntry` JSON):

| Field | Type | Required |
|---|---|---|
| `timestamp` | `string` (ISO datetime) | yes |
| `level` | `"log"\|"warn"\|"error"` | yes |
| `module` | `string` | yes |
| `message` | `string` | yes |
| `args` | `string` | optional |

Inbound messages: not constrained by client (printed only).

## 13. API Safety Rules (for future changes)

1. Do not change request/response field names used in parser code without synchronized code updates.
2. For word-card data, return plain text fields (especially `definitions[].definition`), not HTML.
3. For OpenAI/Gemini translation flows, keep output compatible with `original||translation` line format.
4. For signed endpoints behind `httpClient`, backend must preserve header contract (`x-sign`, `x-timestamp`, etc.).
5. Any provider-specific endpoint (Anthropic/custom/proxy) must either:
   - fully emulate current request/response contract, or
   - add dedicated adapter/parser and update this contract doc.
