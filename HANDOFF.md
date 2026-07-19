# Legally handoff - submission-ready build

## Status

The feature-hash embedding has been replaced with local `Xenova/all-MiniLM-L6-v2` inference through `@huggingface/transformers` 4.2.0 and `onnxruntime-node` 1.24.3.

Candidate extraction now uses the stable `gemini-3.5-flash` model. Gemini remains limited to structured evidence extraction; deterministic TypeScript owns classification, confidence, and review priority.

Completed:

- Added `src/lib/analysis/embeddings.ts` with a lazy module-level pipeline singleton.
- Added SHA-256 keyed in-memory embedding and in-flight caches.
- Exposed async `embedText()` and `cosineSimilarity()` functions.
- Made `extractScoringFeatures()`, `scoreContradiction()`, all adapters, and the API caller async.
- Preserved every existing `SCORING_CONFIG` weight and threshold.
- Added Node startup pre-warming through `src/instrumentation.ts`.
- Added the ONNX runtime package to pnpm's narrow build-script allowlist.
- Added `.cache/` to `.gitignore`; the first download populated about 88 MB locally.
- Updated README and walkthrough documentation.
- Updated existing tests and added real MiniLM integration fixtures for all three classifications.

The extraction prompt/schema, Gemini integration, and UI were not changed as part of this embedding swap.

## Verification completed

- `pnpm test`: **31/31 passed**
- `pnpm typecheck`: passed
- `pnpm lint`: passed
- `pnpm build`: passed with Next.js 16.2.10
- Production server startup logged successful MiniLM pre-warming.
- Complete production UI analysis passed with **4 verified candidates**, **1 unsupported candidate excluded**, **2 Direct**, **1 Inferential**, and **1 False positive**.
- The Inferential result filter was exercised and displayed only the expected sleep-timeline finding.

## Fixture similarity comparison

| Fixture | Old feature hash | MiniLM | Classification |
|---|---:|---:|---|
| Direct: home all evening vs went for groceries | 0.762648 | 0.403441 | `DIRECT` |
| Inferential: asleep at 10 vs awake until midnight | 0.163265 | 0.626990 | `INFERENTIAL` |
| False positive: around 8 vs 8:05 | 0.280702 | 0.726539 | `FALSE_POSITIVE` |

These values illustrate why similarity is only one signal: high semantic similarity correctly recognizes that the false-positive pair discusses the same fact, while hedge/time policy prevents escalation.

## Runtime compatibility

- Shell repaired and verified with Node.js 24.14.0, npm 11.6.2, and pnpm 11.9.0.
- The repo now declares Node.js `>=20.9.0`, matching Next.js 16.2.10's requirement.
- `@huggingface/transformers` 4.2.0 does not publish a stricter Node `engines` field in its package metadata.

## Resume commands

In a normal Node installation:

```bash
cd C:/Users/vieth/Documents/edward/legally
pnpm test
pnpm typecheck
pnpm lint
pnpm build
pnpm dev
```

Open `http://localhost:3000`. The committed `.env.example` documents configuration; the local `.env.local` remains ignored and must never be committed.

## Submission follow-up

Read `docs/APP_GUIDE.md`, then record and upload the walkthrough using `docs/WALKTHROUGH.md`.

Do not retune `DIRECT_SIM_THRESHOLD` casually. It was deliberately preserved for this task and should be calibrated later using attorney-labeled deposition pairs.
