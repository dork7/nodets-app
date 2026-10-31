# Support-ticket triage with Laya (`POST /v1/laya/classify-ticket`)

## What it does

Classifies a support ticket (subject and body) with `@receptron/laya`, which runs a local ONNX model. By default it answers three questions:

| Key          | Type   | Answer                                               |
| ------------ | ------ | ---------------------------------------------------- |
| `department` | choice | `billing`, `technical` or `general`                  |
| `urgency`    | score  | `low`, `medium`, `high` or `critical`                |
| `refundRisk` | noul   | Probability that the customer is asking for a refund |

Callers can send their own question set instead.

## Code

| File                                  | Role                                                                                   |
| ------------------------------------- | -------------------------------------------------------------------------------------- |
| `src/api/laya/router.ts` / `model.ts` | Route and Zod schemas: a discriminated union of `choice`, `score` and `noul` questions |
| `src/api/laya/service.ts`             | `classifyTicket`; the Laya model is loaded lazily once and cached                      |
| `src/config/prompt.ts`                | `DEFAULT_TICKET_QUESTIONS`                                                             |

## Endpoint

`POST /v1/laya/classify-ticket`

```json
{
 "subject": "Charged twice",
 "body": "I was billed two times this month, please refund one.",
 "questions": {
  "sentiment": {
   "type": "choice",
   "instructions": "Customer sentiment?",
   "criteria": ["positive", "neutral", "negative"]
  }
 }
}
```

`questions` is optional. If it is omitted or empty, the default set is used.

**Success (200):**

```json
{
  "answers": {
    "department": { "type": "choice", "choice": "billing", "probabilities": { … }, "confidence": 0.9, "rl_agent": { … } },
    "urgency": { "type": "score", "score": 2, "legend": { … }, … },
    "refundRisk": { "type": "noul", "noul": 0.93, … }
  },
  "usage": { "input_tokens": 0, "output_tokens": 0 }
}
```

## How it works

1. **First call:** `Laya.load()` downloads the model and tokenizer from **huggingface.co** and builds an ONNX session. The promise is cached. If it fails, the cache is reset so the next call tries again.
2. **Every call:** `laya.systemOne(ticket, questions)` runs.

## Errors

| Status             | Message                                                                 | Cause / fix                                                                                          |
| ------------------ | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 400                | `Invalid input: body,subject …` / `body,body …`                         | Missing or empty field                                                                               |
| 400                | `Invalid input: body,questions,<key>,type Invalid discriminator value…` | Question `type` isn't `choice`, `score` or `noul`                                                    |
| 400                | `Invalid input: …criteria…`                                             | For example, a `score` question with an empty `criteria` array                                       |
| 500                | `Failed to classify ticket: <fetch/HF error>`                           | First load can't reach HuggingFace (offline, proxy, or HF rate-limited). It retries on the next call |
| 500                | `Failed to classify ticket: <onnxruntime error>`                        | ONNX runtime unavailable on the platform, or out of memory                                           |
| 500                | `Failed to classify ticket: …`                                          | Laya rejected the question shape at runtime                                                          |
| Slow first request | Model download and session build happen on the first call               | Warm it up after deploy                                                                              |

## Known issues

- **The first request after each restart is slow**, because the model loads lazily.
- **Needs outbound network access to HuggingFace** unless the model is already cached locally.
