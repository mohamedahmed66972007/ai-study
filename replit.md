# Mudhakir AI — مذاكر الذكي

Arabic-first AI study companion. Students upload a PDF (book, lecture notes,
study material) and ask any question in two ways:

1. **Type a question** — answered strictly from the document with page-level
   citations (page number + exact quote).
2. **Upload an image of a question (or several questions)** — sitting right
   next to the question input. The image is sent to Gemini together with the
   document context. Gemini extracts every question from the image and
   answers each one based on the same document, with the same citations
   format. Each extracted question becomes a regular Q&A entry in the
   document's history.

## Architecture

Monorepo (pnpm workspaces).

- `artifacts/study-ai/` — React + Vite frontend (RTL Arabic, Cairo font, theme
  system). Uses wouter for routing, TanStack Query, shadcn/ui, framer-motion,
  sonner.
- `artifacts/api-server/` — Express API server. Routes mounted under `/api`.
- `lib/api-spec/` — OpenAPI spec (single source of truth).
- `lib/api-client-react/` — Generated TanStack Query hooks (Orval).
- `lib/api-zod/` — Generated Zod schemas (Orval), used by the server for
  input validation. The orval config strips `multipart/form-data`
  endpoints from the zod generation (those endpoints use multer instead),
  to avoid `Blob`/`File` type clashes with same-named zod schemas.
- `lib/db/` — Drizzle ORM schema and pg pool.
- `lib/integrations-gemini-ai/` — Gemini integration (uses Replit AI Integrations proxy, env: `AI_INTEGRATIONS_GEMINI_BASE_URL`, `AI_INTEGRATIONS_GEMINI_API_KEY`).

## Theme system

Custom in-house provider (`src/components/theme-provider.tsx`) that combines a
light/dark mode toggle with one of 8 color themes (teal, blue, green, red,
yellow, orange, purple, rose). The mode is toggled by adding/removing the
`dark` class on `<html>`. The color theme is written to `data-color="…"` on
`<html>`. CSS variables in `src/index.css` override `--primary`, `--ring`,
`--chart-1` and the ambient glow per theme, with a separate paired rule for
`.dark[data-color="…"]`. Both preferences persist to `localStorage`.

UI controls live in the header (`src/components/theme-controls.tsx`):
sun/moon toggle and a palette dropdown with color swatches.

## Pages

- `/` — Library home: stats strip (3 metrics), document cards with delete,
  recent questions feed, prominent upload CTA.
- `/upload` — Drag-and-drop PDF upload (max 25 MB, PDF only) with title
  field. Posts multipart to `POST /api/documents`, then navigates to the
  document.
- `/documents/:id` — Two-pane chat: Q&A history on the right, source
  viewer on the left. Citation chips load the cited page in the source
  viewer. Auto-polls while status is "processing". The composer at the
  bottom has a text input plus an inline **image button** that opens a
  preview dialog and uploads the image to the extract-and-answer
  endpoint.

## API endpoints

- `GET    /api/healthz`
- `GET    /api/stats` — library aggregate stats
- `GET    /api/documents` — list
- `POST   /api/documents` — multipart upload (`file`, `title`); kicks off
  async PDF parsing
- `GET    /api/documents/:id`
- `DELETE /api/documents/:id`
- `GET    /api/documents/:id/file` — original PDF bytes for the source viewer
- `GET    /api/documents/:id/pages/:pageNumber`
- `GET    /api/documents/:id/questions`
- `POST   /api/documents/:id/questions` — `{ answer, citations: [{ pageNumber, quote }] }`
- `POST   /api/documents/:id/questions/from-image` — multipart `file`
  (image/*, ≤25 MB). Sends the image + the document context to Gemini in
  one call and persists every extracted answered question into
  `questionsTable`. Returns the array of created `QuestionRecord`s.
- `GET    /api/documents/recent-questions` — latest 10 questions across
  all documents.

## Data model

- `documents` (id, title, filename, total_pages, status `processing|ready|failed`, error_message, file_data bytea, created_at)
- `document_pages` (id, document_id, page_number, content) — extracted per-page text
- `questions` (id, document_id, question, answer, citations jsonb, created_at)

## AI strategy

For each typed question we pass the full document (page-marked, capped at
600k chars to stay within the long context window) to `gemini-2.5-flash`
with a strict system prompt and a JSON response schema (`{ answer, citations: [{ pageNumber, quote }] }`).

For image-based questions, we send the same document context plus the
uploaded image (as `inlineData`) to Gemini in a single call with a JSON
response schema of `{ questions: [{ question, answer, citations: [...] }] }`.
The server validates that every cited `pageNumber` actually exists in the
document before persisting, which prevents hallucinated citations in both
flows.

## PDF parsing

`pdfjs-dist` legacy build runs on the server. The bundle externalizes
`pdfjs-dist` so the worker file can be resolved from `node_modules` at
runtime. Per-page text is reconstructed from text items by Y-coordinate.

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
