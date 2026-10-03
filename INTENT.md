# Project Intent

## What this is

This repository started from the `express-typescript-2024` boilerplate (see `README.md`, `CHANGELOG.md`, `package.json`'s `"name": "express-typescript-boilerplate"`) but has since grown into a personal multi-feature backend that experiments with self-hosted and hosted LLMs. The README and CHANGELOG at the repo root are leftovers from that original template and no longer describe what the project actually does — `git log` and the source tree are the accurate record of intent. See `ARCHITECTURE.md` for the technical structure; this file covers *why* each part exists.

## Core capabilities

- **RAG-backed chatbot** (`/ws/chatAI`, server-rendered UI at `/chatAI`) — a WebSocket chat interface with streaming responses, tool-calling, conversation-history persistence (MongoDB), and an optional retrieval-augmented-generation mode that grounds answers in ingested documents via a LlamaIndex + Qdrant pipeline. Recent work on the `rag-system` branch has focused specifically on this: persisting vectors in Qdrant (`b8a6099`, `b3e6699`), adding LLM-backed query/ingest routes (`f71951a`), strengthening the no-context guardrail so the bot doesn't hallucinate when retrieval comes up empty (`e8b6c1e`), centralizing all prompt text into one file, adding a query-vs-retrieved-context relevance check before injecting RAG results, and widening the set of ingestible file types (jsonl, xml, config/code formats).
- **Multi-provider AI abstraction** — rather than hardcoding one LLM vendor, the app registers interchangeable OpenAI-compatible clients (LocalAI, OpenRouter, Ollama) behind a single `callAI()` call path, so features can run against a free/local model during development and swap providers per-request. This suggests a deliberate goal of not being locked into a single paid API, likely for cost control and offline development.
- **Vision / image analysis** (`/v1/vision`, `/v1/nutrition`) — extracts structured detail (and OCR text) from uploaded images through the same multi-provider AI layer, with a nutrition-specific variant for food photos.
- **Goal tracking** (`/v1/goals`, UI at `/goals`) — lets a user define learning goals, get AI-suggested subtopics, get real YouTube course suggestions per topic (via the YouTube Data API), log study hours, and track pace against a deadline. This is a personal productivity/learning-tracker feature, not a customer-facing product surface.
- **Support-ticket triage** (`/v1/laya`, added most recently in `2f11877`) — classifies an incoming support ticket (department, urgency, refund risk) using `@receptron/laya`, a local ONNX-based classifier that runs without an external LLM call. Framed as an API other services could call to auto-route tickets.
- **File storage & ingestion plumbing** (`/v1/localStorage`, `/v1/minio`, `/v1/fs-util`) — two parallel storage backends (local disk tracked in MongoDB, and MinIO object storage) exist to feed uploaded files into the RAG pipelines and chat attachments.
- **Monitoring** (`/v1/monitor`, `/dashboard`) — every AI call and WebSocket RPC is logged to MongoDB with duration/status/token usage, viewable on a dashboard — evidence of an ongoing interest in observing model cost/latency/reliability across providers, not just building features blind.
- **Project/task planner** (`/v1/taskPlanner`) — a project-management timeline tool (renamed from "tasks" to "Projects" per `d619137`), tracking status and progress; a separate concern from the AI features, more general personal-productivity tooling.

## What problem each area solves

| Area | Problem it addresses |
|---|---|
| Multi-provider AI layer | Avoid vendor lock-in / API cost while developing; let local models stand in for paid ones |
| RAG pipeline(s) | Ground chatbot answers in real, user-provided documents instead of relying purely on model recall |
| RAG relevance check | Prevent a low-quality/irrelevant vector match from being blindly trusted and injected into an answer |
| Goal tracker | Turn a vague learning goal into a concrete, paced plan with real course material |
| Laya triage | Automate first-pass support-ticket classification without a network call to an LLM |
| Monitor/dashboard | Give visibility into which provider/model is actually being used, and at what cost/latency, across an app that intentionally supports several |

## Current focus (branch: `rag-system`)

The active line of work is entirely about making the RAG chatbot pipeline correct and trustworthy: persisting vectors durably (Qdrant), guarding against answering from empty/irrelevant context, keeping prompt text maintainable in one place (`src/config/prompt.ts`), and broadening what file types can be fed into it. The existence of a second, older, Chroma-backed RAG pipeline (`/v1/rag/*`, see `ARCHITECTURE.md`) that the chatbot no longer calls suggests the LlamaIndex/Qdrant approach superseded an earlier implementation — this reads as an in-progress migration rather than two deliberately maintained features, but that has not been explicitly confirmed in code or commit messages, so treat it as an open question rather than settled fact.
