# GrowEasy CSV Importer

AI-powered CRM lead importer. Upload any CSV export (Facebook Lead Ads, Google Ads, Excel, real-estate CRM exports, manual spreadsheets — any column layout), preview it, confirm, and the backend uses an LLM to map arbitrary columns into the GrowEasy CRM schema.

## Stack

- **Frontend + Backend:** Next.js 14 (App Router), single deployable app — the API route in `app/api/extract` acts as the backend.
- **CSV parsing:** PapaParse (client-side preview).
- **AI:** Anthropic Claude or OpenAI (configurable via env vars).
- **Styling:** Tailwind CSS, with dark mode toggle.

## How it works

1. **Upload** — drag & drop or file picker, CSV only.
2. **Preview** — parsed client-side with PapaParse, shown in a sticky-header, scrollable table. No AI call yet.
3. **Confirm Import** — only on click does the frontend POST the parsed rows to `/api/extract`.
4. **Backend** — batches rows (20 per batch) and sends each batch to the configured LLM with a system prompt that encodes all the GrowEasy CRM mapping rules (allowed `crm_status`/`data_source` values, date format, multi-email/phone handling, skip logic for rows with no email/phone). Each batch retries once on failure; if a batch fails twice, those rows are marked skipped with the error reason (so one bad batch doesn't fail the whole import).
5. **Results** — imported vs skipped counts, and two tables: successfully mapped CRM records, and skipped rows with reasons.

## Setup

```bash
npm install
cp .env.example .env.local
```

Edit `.env.local`:

```
AI_PROVIDER=anthropic          # or "openai"
ANTHROPIC_API_KEY=sk-ant-...   # if using anthropic
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
# or
OPENAI_API_KEY=sk-...          # if using openai
OPENAI_MODEL=gpt-4o-mini
```

Run locally:

```bash
npm run dev
```

Open http://localhost:3000. Try uploading `sample-data/sample-leads.csv` — it's a deliberately messy example (missing names, alt phone/email columns, a row with no contact info that should be skipped).

## Deploy (Vercel)

1. Push this repo to GitHub.
2. Import it into [Vercel](https://vercel.com/new).
3. Add the environment variables from `.env.example` in the Vercel project settings.
4. Deploy. The API route and frontend ship together — no separate backend deployment needed.

## Design notes / trade-offs

- **Single Next.js app instead of separate Express backend:** simplifies deployment to one hosted URL while still cleanly separating frontend (`app/page.tsx`) from backend (`app/api/extract/route.ts`) and shared logic (`lib/`).
- **Batching:** rows are chunked (default 20/batch) to keep prompts within reasonable token limits and make partial failures recoverable — one bad batch is skipped with a clear reason rather than failing the entire import.
- **Provider-agnostic AI layer:** `lib/ai.ts` abstracts over Anthropic/OpenAI behind one `extractBatch()` function, so swapping providers is a one-line env change.
- **Stateless:** no database — the CRM schema doesn't require persistence for this assignment, results are returned directly to the client.
- **Validation on the server:** even though the prompt constrains `crm_status`/`data_source` to allowed values, the API route re-validates them server-side and blanks anything the model returns outside the allowed set, rather than trusting the model's output blindly.

## Possible next steps (not yet implemented)

- Streaming/incremental results as batches complete (currently waits for all batches).
- Virtualized rendering for very large CSVs (currently renders all rows in a scrollable table).
- Unit tests for the sanitization/validation logic.
- Docker setup.
