# Vision (image analysis) and the nutrition page

## What it does

- **`POST /v1/vision/analyze`** sends an uploaded image and a prompt to a vision model and returns its reply. It also returns the reply parsed as JSON when it can be.
- **`/v1/nutrition`** is a server-rendered page. The user uploads a food photo, it goes to the vision model through OpenRouter, and the JSON reply is rendered as a nutrition report: item list plus calorie, protein, fat and carbohydrate totals.

## Code

| File                                | Role                                                                     |
| ----------------------------------- | ------------------------------------------------------------------------ |
| `src/api/vision/visionRouter.ts`    | Multer upload (5MB, `image/*` only) and route                            |
| `src/api/vision/visionService.ts`   | `extractImageDetails`: builds a data URL, calls the model, extracts JSON |
| `src/api/vision/nutritionRouter.ts` | GET/POST page; `buildReport` turns the JSON into totals                  |
| `src/public/nutrition.ejs`          | Page (a plain form POST, no JavaScript)                                  |
| `src/config/prompt.ts`              | `DEFAULT_VISION_PROMPT`                                                  |

## Endpoints

| Method | Path                 | Input                                                                                                  | Success                                        |
| ------ | -------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------- |
| POST   | `/v1/vision/analyze` | multipart: `image` (≤5MB, `image/*`), `prompt?`, `provider?` (`openrouter` or anything else), `model?` | `{ details, rawText, reasoning? }`             |
| GET    | `/v1/nutrition`      | —                                                                                                      | Empty form                                     |
| POST   | `/v1/nutrition`      | multipart: `image`, `prompt?`                                                                          | Page with the report, or with an error message |

`details` is the first JSON array (or, failing that, object) found in the reply, including inside markdown code fences. If nothing parses, `details` is the raw reply text.

**Models:** OpenRouter uses `OPENROUTER_VISION_MODEL`; LocalAI uses `LOCALAI_IMAGE_ANALYSIS_MODEL`.

## Errors

**`/v1/vision/analyze`**

| Status | Message                                                       | Cause                                                                                                                          |
| ------ | ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 400    | `Image file is required under the "image" form field.`        | No file, or the wrong field name                                                                                               |
| 413    | `File too large`                                              | Over 5MB                                                                                                                       |
| 400    | `Unexpected field`                                            | The file isn't `image/*`. The file filter raises `LIMIT_UNEXPECTED_FILE`, so the message is misleading                         |
| 500    | `Failed to process the image with AI: <error>`                | Provider down, bad key, the model doesn't support images, or it rejects that image format. `stack` is included in the response |
| 200    | `rawText: "No readable text detected in the provided image."` | The model returned empty content                                                                                               |

**`/v1/nutrition`** (all errors are shown on the page, and the status is always 200):

| Message on page                                                | Cause                                                                                                                                                          |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Unable to process the uploaded image.`                        | Upload error: too large, not an image, or wrong field                                                                                                          |
| `Image file is required under the "image" form field.`         | No file                                                                                                                                                        |
| `Failed to process the image with AI: …`                       | OpenRouter error: missing or invalid `OPENROUTER_API_KEY`, rate limit on free models, model unavailable                                                        |
| `The AI response could not be parsed into a nutrition report.` | The reply had no JSON array. **This always happens when `prompt` is left empty**, because the default vision prompt asks for a description, not nutrition JSON |

## Known issues

- **The nutrition page needs a prompt that asks for JSON.** With no prompt, it falls back to `DEFAULT_VISION_PROMPT` and can't produce a report.
- **Not recorded in monitoring.** Vision calls go straight to the SDK clients, not through `callAI`, and aren't logged.
- **Misleading error for non-image uploads.** The file filter uses `LIMIT_UNEXPECTED_FILE`, so the response says `Unexpected field`.
