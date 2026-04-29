# Mudhakir AI — مذاكر الذكي

Arabic-first AI study companion. Students upload a PDF (book, lecture notes, study material), the server extracts the text per page, and Gemini answers questions strictly grounded in that document with page-level citations (page number + exact quote).

## Architecture

Monorepo (pnpm workspaces).

- `artifacts/study-ai/` — React + Vite frontend (RTL Arabic, Cairo font, parchment + muted teal palette). Uses wouter for routing, TanStack Query, shadcn/ui, framer-motion, sonner.
- `artifacts/api-server/` — Express API server. Routes mounted under `/api`.
- `lib/api-spec/` — OpenAPI spec (single source of truth).
- `lib/api-client-react/` — Generated TanStack Query hooks (Orval).
- `lib/api-zod/` — Generated Zod schemas (Orval), used by the server for input validation.
- `lib/db/` — Drizzle ORM schema and pg pool.
- `lib/integrations-gemini-ai/` — Gemini integration (uses Replit AI Integrations proxy, env: `AI_INTEGRATIONS_GEMINI_BASE_URL`, `AI_INTEGRATIONS_GEMINI_API_KEY`).

## Pages

- `/` — Library home: stats strip, document cards (with delete), recent questions feed, prominent upload CTA.
- `/upload` — Drag-and-drop PDF upload (max 25 MB, PDF only) with title field. Posts multipart to `POST /api/documents`, then navigates to the document.
- `/documents/:id` — Two-pane chat: Q&A history on the right, source viewer on the left. Citation chips load the cited page in the source viewer. Auto-polls while status is "processing".

## API endpoints

- `GET  /api/healthz`
- `GET  /api/stats` — library aggregate stats
- `GET  /api/documents` — list
- `POST /api/documents` — multipart upload (`file`, `title`); kicks off async PDF parsing
- `GET  /api/documents/:id` — single document
- `DELETE /api/documents/:id`
- `GET  /api/documents/:id/pages/:pageNumber` — page content for the source viewer
- `GET  /api/documents/:id/questions` — Q&A history for one document
- `POST /api/documents/:id/questions` — ask a question; returns `{ answer, citations: [{ pageNumber, quote }] }`
- `GET  /api/documents/recent-questions` — latest 10 questions across all documents

## Data model

- `documents` (id, title, filename, total_pages, status `processing|ready|failed`, error_message, created_at)
- `document_pages` (id, document_id, page_number, content) — extracted per-page text
- `questions` (id, document_id, question, answer, citations jsonb, created_at)

## AI / RAG strategy

For each question we pass the full document (page-marked, capped at 600k chars to stay within the long context window) to `gemini-2.5-flash` with a strict system prompt and a JSON response schema (`{ answer: string, citations: [{ pageNumber, quote }] }`). The server validates that every cited `pageNumber` actually exists in the document before persisting, which prevents hallucinated citations.

## PDF parsing

`pdfjs-dist` legacy build runs on the server. The bundle externalizes `pdfjs-dist` so the worker file can be resolved from `node_modules` at runtime. Per-page text is reconstructed from text items by Y-coordinate.

## Local commands

- Codegen after editing the OpenAPI spec: `pnpm --filter @workspace/api-spec run codegen`
- DB push: `pnpm --filter @workspace/db run push`
- Typecheck everything: `pnpm run typecheck`

## Replit dev / deploy setup

- The `Start application` workflow runs `bash scripts/dev.sh`, which boots the
  Express API on port 8080 and the Vite dev server on port 5000 in parallel.
  Vite proxies `/api` → `http://localhost:8080` (see
  `artifacts/study-ai/vite.config.ts`).
- Required env vars: `DATABASE_URL` (Replit PostgreSQL),
  `AI_INTEGRATIONS_GEMINI_BASE_URL`, `AI_INTEGRATIONS_GEMINI_API_KEY`
  (Replit Gemini AI Integration).
- Production deployment is autoscale: the build step builds the React app and
  the API server, and the run step starts only the Express server. In
  production the Express server serves the built React `dist/public` as static
  files with SPA fallback (see `artifacts/api-server/src/app.ts`), so the
  whole app runs on a single port.
