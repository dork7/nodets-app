# 🚀 Express TypeScript Boilerplate 2024

[![Build Express Application](https://github.com/edwinhern/express-typescript-2024/actions/workflows/build.yml/badge.svg?branch=master)](https://github.com/edwinhern/express-typescript-2024/actions/workflows/build.yml)
[![CodeQL](https://github.com/edwinhern/express-typescript-2024/actions/workflows/codeql.yml/badge.svg?branch=master)](https://github.com/edwinhern/express-typescript-2024/actions/workflows/codeql.yml)
[![Docker Image CI](https://github.com/edwinhern/express-typescript-2024/actions/workflows/docker-image.yml/badge.svg?branch=master)](https://github.com/edwinhern/express-typescript-2024/actions/workflows/docker-image.yml)
[![Release](https://github.com/edwinhern/express-typescript-2024/actions/workflows/release.yml/badge.svg?branch=master)](https://github.com/edwinhern/express-typescript-2024/actions/workflows/release.yml)

## 🌟 Introduction

Welcome to the Express TypeScript Boilerplate 2024 – a streamlined, efficient, and scalable foundation for building powerful backend services. This boilerplate merges modern tools and practices in Express.js and TypeScript, enhancing productivity, code quality, and performance.

## 💡 Motivation and Intentions

Developed to streamline backend development, this boilerplate is your solution for:

- ✨ Reducing setup time for new projects.
- 📊 Ensuring code consistency and quality.
- ⚡ Facilitating rapid development with cutting-edge tools.
- 🛡️ Encouraging best practices in security, testing, and performance.

## 🚀 Features

- 📁 Modular Structure: Organized by feature for easy navigation and scalability.
- 💨 Faster Execution with tsx: Rapid TypeScript execution with esbuild, complemented by tsc for type checking.
- 🌐 Stable Node Environment: Latest LTS Node version in .nvmrc.
- 🔧 Simplified Environment Variables with Envalid: Centralized and easy-to-manage configuration.
- 🔗 Path Aliases: Cleaner code with shortcut imports.
- 🔄 Dependabot Integration: Automatic updates for secure and up-to-date dependencies.
- 🔒 Security: Helmet for HTTP header security and CORS setup.
- 📊 Logging: Efficient logging with pino-http.
- 🧪 Comprehensive Testing: Robust setup with Vitest and Supertest.
- 🔑 Code Quality Assurance: Husky and lint-staged for consistent quality.
- ✅ Unified Code Style: ESLint and Prettier for a consistent coding standard.
- 📃 API Response Standardization: ServiceResponse class for consistent API responses.
- 🐳 Docker Support: Ready for containerization and deployment.
- 📝 Input Validation with Zod: Strongly typed request validation using Zod.
- 🧩 API Spec Generation: Automated OpenAPI specification generation from Zod schemas to ensure up-to-date and accurate API documentation.

## 🛠️ Getting Started

### Step 1: 🚀 Initial Setup

- Clone the repository: `git clone https://github.com/edwinhern/express-typescript-2024.git`
- Navigate: `cd express-typescript-2024`
- Install dependencies: `npm ci`

### Step 2: ⚙️ Environment Configuration

- Create `.env`: Copy `.env.template` to `.env`
- Update `.env`: Fill in necessary environment variables

### Step 3: 🏃‍♂️ Running the Project

- Development Mode: `npm run dev`
- Building: `npm run build`
- Production Mode: Set `.env` to `NODE_ENV="production"` then `npm run build && npm run start`

## Running `rag.js`

`rag.js` loads the dummy records from `data.json`, stores embeddings in ChromaDB, and asks a sample delivery question using LocalAI.

1. Install dependencies:

```bash
npm install
```

2. Start ChromaDB and LocalAI:

```bash
docker compose -f ai-docker-compose.yml up -d
```

3. Make sure LocalAI has the model used by `rag.js` available in `./models`:

```js
model: 'mathstral-7b-v0.1-imat'
```

If you use a different LocalAI model, update the `model` value in `rag.js`.

4. Run the RAG demo file:

```bash
node rag.js
```

5. Stop the AI services when finished:

```bash
docker compose -f ai-docker-compose.yml down --remove-orphans
```

## 📁 Project Structure

```

## 🖼️ Image Insight Endpoint

- **Route:** `POST /v1/vision/analyze`
- **Body:** `multipart/form-data` with an `image` file field and optional `prompt` text field to guide extraction.
- **Response:** JSON payload containing the extracted `details` summary plus the `rawText` captured from the image, powered by on-device OCR via `tesseract.js` (no external AI calls required).

Example request:

```bash
curl -X POST http://localhost:3000/v1/vision/analyze \
  -H "Authorization: Bearer <token>" \
  -F "prompt=List every item, price, and total you can read." \
  -F "image=@/path/to/receipt.jpg"
```
.
├── api
│   ├── healthCheck
│   │   ├── __tests__
│   │   │   └── healthCheckRouter.test.ts
│   │   └── healthCheckRouter.ts
│   └── user
│       ├── __tests__
│       │   ├── userRouter.test.ts
│       │   └── userService.test.ts
│       ├── userModel.ts
│       ├── userRepository.ts
│       ├── userRouter.ts
│       └── userService.ts
├── api-docs
│   ├── __tests__
│   │   └── openAPIRouter.test.ts
│   ├── openAPIDocumentGenerator.ts
│   ├── openAPIResponseBuilders.ts
│   └── openAPIRouter.ts
├── common
│   ├── __tests__
│   │   ├── errorHandler.test.ts
│   │   └── requestLogger.test.ts
│   ├── middleware
│   │   ├── errorHandler.ts
│   │   ├── rateLimiter.ts
│   │   └── requestLogger.ts
│   ├── models
│   │   └── serviceResponse.ts
│   └── utils
│       ├── commonValidation.ts
│       ├── envConfig.ts
│       └── httpHandlers.ts
├── index.ts
└── server.ts

```

## 🐳 Docker Models (Local AI)

Run LLM models locally using Docker Model Runner (requires Docker Desktop 4.40+).

### Lightweight (low RAM)

```bash
docker model pull ai/smollm2              # 135M–1.7B, very fast
docker model pull ai/phi4-mini            # 3.8B, Microsoft
docker model pull ai/llama3.2:1b          # 1B, Meta
docker model pull ai/llama3.2:3b          # 3B, Meta
docker model pull ai/qwen2.5:0.5b         # 0.5B, Alibaba
docker model pull ai/qwen2.5:1.5b
docker model pull ai/qwen2.5:3b
```

### Best Lightweight Models by Use Case

**General Chat**

| Model | Size | Pull Command |
|-------|------|-------------|
| Qwen2.5 3B | ~2 GB | `docker model pull ai/qwen2.5:3b` |
| Llama 3.2 3B | ~2 GB | `docker model pull ai/llama3.2:3b` |
| Phi-4 Mini | ~2.5 GB | `docker model pull ai/phi4-mini` |
| Gemma 3 4B | ~3 GB | `docker model pull ai/gemma3:4b` |

**Coding**

| Model | Size | Pull Command |
|-------|------|-------------|
| Qwen2.5-Coder 3B | ~2 GB | `docker model pull ai/qwen2.5-coder:3b` |
| Qwen2.5-Coder 7B | ~4.5 GB | `docker model pull ai/qwen2.5-coder:7b` |

**Ultra-light (very low RAM / fast inference)**

| Model | Size | Pull Command |
|-------|------|-------------|
| SmolLM2 1.7B | ~1 GB | `docker model pull ai/smollm2:1.7b` |
| Qwen2.5 1.5B | ~1 GB | `docker model pull ai/qwen2.5:1.5b` |
| Llama 3.2 1B | ~0.7 GB | `docker model pull ai/llama3.2:1b` |

**Embeddings (RAG / semantic search)**

| Model | Pull Command |
|-------|-------------|
| nomic-embed-text | `docker model pull ai/nomic-embed-text` |
| mxbai-embed-large | `docker model pull ai/mxbai-embed-large` |

> **Best picks:** `ai/qwen2.5:3b` for general use, `ai/qwen2.5-coder:3b` for coding, `ai/smollm2:1.7b` for fastest/lowest RAM.

### Mid-range (8–16 GB RAM)

```bash
docker model pull ai/llama3.2             # 8B default, Meta
docker model pull ai/mistral              # 7B, Mistral AI
docker model pull ai/gemma3               # 4B/9B, Google
docker model pull ai/phi4                 # 14B, Microsoft
docker model pull ai/qwen2.5:7b
docker model pull ai/qwen2.5-coder:7b     # code-focused
```

### Large (32 GB+ RAM / GPU)

```bash
docker model pull ai/llama3.3:70b
docker model pull ai/qwen2.5:72b
docker model pull ai/mistral-small
```

### Embedding models (for RAG)

```bash
docker model pull ai/mxbai-embed-large    # good all-around
docker model pull ai/nomic-embed-text
```

### Usage

```bash
docker model run ai/llama3.2              # interactive chat
docker model run ai/smollm2 "your prompt" # one-shot
docker model list                          # list pulled models
```

## 🤝 Feedback and Contributions

We'd love to hear your feedback and suggestions for further improvements. Feel free to contribute and join us in making backend development cleaner and faster!

🎉 Happy coding!
