# tg-cloud-downloader

Telegram → Cloud Storage → Direct Download system.

Send large files (video, hundreds of MB to multi-GB) through Telegram; the system
stores them in cloud storage (Google Drive and/or Cloudflare R2) and returns a
direct HTTP download URL that works reliably with **Android Download Manager (ADM)**.

> **Status: Phase 1 — Bootstrap only.** The project structure, configuration,
> storage/delivery/telegram interfaces, logging, and a mock-backed test suite are
> implemented. The live Telegram → Storage → Download pipeline is built in later
> phases (see roadmap below). Phase 1 runs fully offline against in-memory mocks
> (no credentials required).

## Architecture (target)

```
                TELEGRAM
                   │
                   ▼
         MTProto Large File Receiver   (GramJS, chunked, no size cap)
                   │
                   ▼
              Upload Queue             (sequential / limited concurrency)
                   │
                   ▼
         Storage Abstraction
            /             \
           ▼               ▼
    Google Drive       Cloudflare R2
           \               /
            ▼             ▼
         Delivery Layer            (decoupled from storage)
                   │
                   ▼
          Signed Download URL       (HMAC, expiring, opaque id)
            /             \
           ▼               ▼
          ADM           Browser
```

Storage and Delivery are **decoupled**: the delivery layer never knows which
cloud backend holds the bytes, and the storage layer never decides how files are
served. This lets the strategy (`gdrive-only`, `r2-only`, `gdrive-primary-r2-cache`,
`gdrive-primary-r2-mirror`) change without rewriting Telegram or storage code.

## Tech stack
- Node.js 20+ / TypeScript
- GramJS (MTProto receiver) — Phase 3
- googleapis (Drive resumable upload) — Phase 5
- @aws-sdk/client-s3 (R2, S3-compatible multipart) — Phase 6
- Hono (delivery: Node + Cloudflare Worker) — Phase 7/8
- pino (structured, redacted logging)
- p-queue (upload queue) — Phase 10
- vitest (tests)

## Project layout
```
src/
  config/        env.ts            (config + strategy resolver)
  storage/       storage.interface.ts, storage.service.ts
  storage/providers/  mock.provider.ts (now), gdrive/r2 stubs (later)
  downloads/     delivery.ts       (signed URLs + range serving)
  telegram/      telegram.interface.ts (stub + mock)
  queue/         upload.queue.ts   (concurrency-limited queue)
  utils/         logger.ts, sanitize.ts, stream.ts
  index.ts       (bootstrap + smoke check)
tests/           storage.mock.test.ts, delivery.test.ts, utils.test.ts
.env.example     (placeholders only)
```

## Setup
```bash
npm install
cp .env.example .env        # fill values later; mocks work without them
npm run typecheck
npm test
npm start                   # runs bootstrap + mock smoke check
```

With `USE_MOCKS=true` (default) the app boots and exercises the full
storage+delivery contract using in-memory mocks — no Telegram, Drive, or R2
credentials required.

## Configuration (see `.env.example`)
- `USE_MOCKS` — run without real credentials (Phase 1 default).
- `STORAGE_STRATEGY` — backend selection.
- `DOWNLOAD_SECRET` — HMAC key for signed URLs (**generate a long random value**).
- Telegram / Drive / R2 credentials — required from Phase 2 onward.

## Security
- Secrets only via env; never hard-coded, never logged (redacted by `logger.ts`).
- Download URLs are signed (HMAC), expiring, and wrap an **opaque id** — the raw
  storage key is never user-controlled and cannot be manipulated via URL params.
- Filenames are sanitised and path-traversal is rejected (`utils/sanitize.ts`).

## Roadmap (phases)
- **Phase 0** ✅ Architecture (approved)
- **Phase 1** ✅ Bootstrap (this phase)
- Phase 2 — Telegram bot commands (`/start`, status)
- Phase 3 — MTProto large-file receiving (GramJS, chunked)
- Phase 4 — Storage abstraction (finalise)
- Phase 5 — Google Drive provider (resumable)
- Phase 6 — Cloudflare R2 provider (multipart)
- Phase 7 — Download HTTP layer (range/206/416)
- Phase 8 — Cloudflare Worker delivery
- Phase 9 — File organization
- Phase 10 — Upload queue / multi-file
- Phase 11 — Real progress
- Phase 12 — Anime filename parsing
- Phase 13 — Download web page
- Phase 14 — Admin panel
- Phase 15 — Security review
- Phase 16 — Database
- Phase 17 — Production deployment
