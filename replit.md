# Mudhakir AI — مذاكر الذكي

Arabic-first AI study companion. Two complementary modes:

1. **Books / lecture notes** — Upload a PDF, ask any question, get an answer
   strictly grounded in the document with page-level citations (page number +
   exact quote).
2. **Question sheets** — Upload an image OR PDF that contains questions
   (exam, worksheet, textbook page). Gemini extracts every question, answers
   each one, and provides a "proof / explanation" that the student can reveal
   per answer to verify.

## Architecture

Monorepo (pnpm workspaces).

- `artifacts/study-ai/` — React + Vite frontend (RTL Arabic, Cairo font, theme
  system). Uses wouter for routing, TanStack Query, shadcn/ui, framer-motion,
  sonner.
- `artifacts/api-server/` — Express API server. Routes mounted under `/api`.
- `lib/api-spec/` — OpenAPI spec (single source of truth).
- `lib/api-client-react/` — Generated TanStack Query hooks (Orval).
- `lib/api-zod/` — Generated Zod schemas (Orval), used by the server for input validation.
- `lib/db/` — Drizzle ORM schema and pg pool.
- `lib/integrations-gemini-ai/` — Gemini integration (uses Replit AI Integrations proxy, env: `AI_INTEGRATIONS_GEMINI_BASE_URL`, `AI_INTEGRATIONS_GEMINI_API_KEY`).

## Theme system

Custom in-house provider (`src/components/theme-provider.tsx`) — does not use
`next-themes` because we combine a light/dark mode with one of 8 color
themes (teal, blue, green, red, yellow, orange, purple, rose). The mode is
toggled by adding/removing the `dark` class on `<html>`. The color theme is
written to `data-color="…"` on `<html>`. CSS variables in `src/index.css`
override `--primary`, `--ring`, `--chart-1` and the ambient glow per theme,
with a separate paired rule for `.dark[data-color="…"]`. Both preferences
persist to `localStorage`.

UI controls live in the header (`src/components/theme-controls.tsx`):
sun/moon toggle and a palette dropdown with color swatches.

## Pages

- `/` — Library home: hero, stats strip (4 metrics), recent question sheets,
  document library, and recent questions feed.
- `/upload` — Single page with a mode picker (`?mode=doc` or `?mode=sheet`).
  Drag-and-drop, validates type/size, posts multipart and routes to the
  resulting record.
- `/documents/:id` — Two-pane chat for books: Q&A history + source viewer
  with citation chips.
- `/sheets` — Grid of all uploaded question sheets.
- `/sheets/:id` — Numbered Q&A cards with a per-answer "show proof"
  collapsible button. Side panel previews the original image/PDF.

## API endpoints

Documents (existing):

- `GET  /api/healthz`
- `GET  /api/stats` — library aggregate stats (now also includes
  `questionSheetCount` and `extractedQuestionCount`)
- `GET  /api/documents`
- `POST /api/documents` — multipart upload (`file`, `title`); kicks off async PDF parsing
- `GET  /api/documents/:id`
- `DELETE /api/documents/:id`
- `GET  /api/documents/:id/pages/:pageNumber`
- `GET  /api/documents/:id/questions`
- `POST /api/documents/:id/questions` — `{ answer, citations: [{ pageNumber, quote }] }`
- `GET  /api/documents/recent-questions`

Question sheets (new):

- `GET    /api/question-sheets`
- `POST   /api/question-sheets` — multipart `file` (image/* or
  application/pdf, ≤25 MB) + `title`. Persists immediately as
  `status="processing"`, then runs Gemini extraction in the background.
- `GET    /api/question-sheets/:id` — sheet + extracted questions array
- `DELETE /api/question-sheets/:id`
- `GET    /api/question-sheets/:id/file` — raw bytes (for inline preview)

## Data model

- `documents` (id, title, filename, total_pages, status, error_message, created_at)
- `document_pages` (id, document_id, page_number, content)
- `questions` (id, document_id, question, answer, citations jsonb, created_at)
- `question_sheets` (id, title, source_type `image|pdf`, filename, mime_type,
  file_data bytea, status, error_message, question_count, created_at)
- `extracted_questions` (id, sheet_id [cascade], question_number, question,
  answer, explanation)

## AI strategy

**Documents.** For each user question we pass the full document
(page-marked, capped at 600k chars) to `gemini-2.5-flash` with a strict
JSON response schema. The server validates that every cited `pageNumber`
actually exists before persisting, which prevents hallucinated citations.

**Question sheets.** The uploaded image or PDF is sent directly to
`gemini-2.5-flash` as `inlineData` (with the original mime type). A strict
system instruction tells the model to extract *every* question in order,
answer each one in the same language as the question, and provide a
verifiable explanation. Response is constrained to a JSON schema with
`{ questions: [{ questionNumber, question, answer, explanation }] }`.

## PDF parsing

`pdfjs-dist` legacy build runs on the server (only used for the document
flow — question sheets send PDFs directly to Gemini and don't need it).
The bundle externalizes `pdfjs-dist` so the worker file can be resolved
from `node_modules` at runtime.

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
