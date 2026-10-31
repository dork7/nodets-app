# AI providers and the LLM call path

## What it does

This is a small registry of OpenAI-compatible clients, one per provider. Most features send model requests through one function, `callAI`. The same layer also:

- creates embeddings for the Chroma pipeline
- defines the chatbot's tools
- lists the available providers and models to the UI

## Code

| File                                                                   | Role                                                                       |
| ---------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| `src/config/openaiConfig/registry.ts`                                  | `Map` of provider name to client                                           |
| `src/config/openaiConfig/loadAIProviders.ts`                           | Registers the three providers at boot (static imports)                     |
| `src/config/openaiConfig/providers/{localAI,openRouterAI,ollamaAI}.ts` | One `OpenAI` SDK client each                                               |
| `src/config/openaiConfig/index.ts`                                     | `getOpenAIInstance`, the lazy `openai` proxy, `callAI`, `createEmbeddings` |
| `src/config/openaiConfig/embeddings.ts`                                | `embedMany` / `embedText`, batched 100 at a time                           |
| `src/config/openaiConfig/tools.ts`                                     | The chat tool definitions (`run_bash`) and the executor                    |
| `src/config/prompt.ts`                                                 | Every prompt string                                                        |
| `src/config/openRouterModels.ts`                                       | Static list of OpenRouter models shown in the UI                           |
| `src/api/aiProviders/*`                                                | `GET /v1/aiProviders`                                                      |
| `src/server.ts:140`                                                    | `GET /chatModels`                                                          |

## Providers

| Registry name       | Base URL                          | API key              |
| ------------------- | --------------------------------- | -------------------- |
| `localAI` (default) | `LOCALAI_URL` with `/v1` enforced | `OPENAI_API_KEY`     |
| `openRouterAI`      | `OPENROUTER_BASE_URL`             | `OPENROUTER_API_KEY` |
| `ollama`            | `OLLAMA_URL` with `/v1` enforced  | `OPENAI_API_KEY`     |

The registry names differ from the strings some REST features accept. `/v1/ai/chat`, `/v1/vision/analyze` and goals take `provider: "openrouter"` (case-insensitive) and use the `openRouterAIInstance` client directly. Any other value means LocalAI. The WebSocket chatbot takes the registry name (`openRouterAI`, `ollama`, `localAI`).

## Call path

- `callAI(model, messages, { stream, tools, temperature, max_tokens, provider }, signal)` calls `client.chat.completions.create(...)` on the named provider. `localAI` is the default. When `stream` is set, it adds `stream_options.include_usage` so token counts arrive in the last chunk.
- `openai` is a `Proxy` that resolves `localAI` on each property access, so it keeps working even though providers are registered after import.
- `createEmbeddings(input, { model = LOCALAI_EMBEDDING_MODEL, provider })` is used by the Chroma pipeline only. The LlamaIndex pipeline uses its own OpenRouter embedder (`src/config/llamaConfig/index.ts`).

## Endpoints

| Method | Path                          | Response                                                                                                              |
| ------ | ----------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| GET    | `/v1/aiProviders`             | `[{ name, baseURL }]` for each registered provider                                                                    |
| GET    | `/chatModels?provider=<name>` | `{ models: [{ value, label }] }`. For `openRouterAI` it is the static list; for anything else, LocalAI's `/v1/models` |

## Configuration

`LOCALAI_URL`, `LOCALAI_CHAT_MODEL`, `LOCALAI_EMBEDDING_MODEL`, `LOCALAI_SUMMARY_MODEL`, `LOCALAI_RELEVANCE_MODEL`, `LOCALAI_IMAGE_ANALYSIS_MODEL`, `OPENROUTER_*`, `OLLAMA_URL`, `OLLAMA_CHAT_MODEL`, `OPENAI_API_KEY`.

## Errors

| Error                                                                 | When                                                                                                                                                                           | What you see                                                                                           |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ |
| `No OpenAI-compatible model instance registered for provider: <name>` | `callAI` or `getOpenAIInstance` gets an unknown provider name, e.g. `openrouter` instead of `openRouterAI` on the WebSocket, or a call made before `loadAIProviders()` has run | Thrown. The chatbot turns it into `stream_error`                                                       |
| `Invalid model handler module: …`                                     | A provider module lacks `name` or `handler`                                                                                                                                    | Thrown inside the `app.listen` callback, so the server keeps listening but no providers are registered |
| `Connection error.` / `ECONNREFUSED` (OpenAI SDK)                     | The provider isn't running, e.g. LocalAI down                                                                                                                                  | Thrown by `callAI`; each feature maps it (500, `stream_error`, …)                                      |
| `401` / `Incorrect API key`                                           | Wrong or empty `OPENROUTER_API_KEY`                                                                                                                                            | Same                                                                                                   |
| `404 model not found` / `400 model is required`                       | The model name isn't available on that provider, or is empty                                                                                                                   | Same                                                                                                   |
| `400 … context length`                                                | Conversation plus attachments exceed the model's context                                                                                                                       | Same                                                                                                   |
| `/chatModels` returns `[{ "value": "", "label": "" }]`                | LocalAI's `/v1/models` is unreachable or takes more than 5 seconds. `getLocalAILLMs` returns `undefined`, which becomes one empty model                                        | No error status, just an empty picker entry                                                            |

## Known issues

- **`callAI` drops the `tools` option** (`src/config/openaiConfig/index.ts:52-53`). `tools: []` is written after the spread of `requestOptions`, so the tools the chatbot passes are overwritten with an empty list. The chatbot's tool loop therefore never gets tool calls from the model.
- **`run_bash` would execute any shell command on the server** (`tools.ts:45`), with a 30 s timeout and 8,000 characters of output. The previous point currently disables it. If `tools: []` is ever removed, any chat user can run commands on the host. Gate it before re-enabling.
- **Two different `LOCALAI_URL` defaults.** `envConfig` defaults to `http://localhost:8000/v1`, while `getLocalAILLMs.ts:1` reads `process.env.LOCALAI_URL || 'http://localhost:8080'` and appends `/v1/models`. If `LOCALAI_URL` is set to the envConfig-style value, the model list, monitoring and aiUtils call `…/v1/v1/models`.
- **The provider name spellings disagree** (`openrouter` vs `openRouterAI`), as described above.
- **LlamaIndex bypasses this layer.** Its embeddings and LLM go straight to OpenRouter and aren't recorded in the AI call logs.
