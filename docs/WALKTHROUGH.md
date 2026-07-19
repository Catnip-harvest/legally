# Legally walkthrough script

Target length: 6–8 minutes. Raw screen recording and narration are enough.

## 0:00–0:40 — Problem and outcome

> This is Legally, a deposition contradiction reviewer. It separates direct contradictions, inferential contradictions, and false positives. The central constraint is that Gemini never supplies the confidence score or final classification.

Show the landing page and the three-type primer.

## 0:40–1:30 — Input and user experience

> A reviewer can paste or import two plain-text depositions and run a comparison. The included testimony is synthetic. The browser sends it to a server route only when Analyze is clicked, and the application does not persist it.

Click **Analyze testimony**.

## 1:30–2:35 — Extraction boundary

Open `src/app/api/analyze/route.ts`, `src/lib/analysis/gemini.ts`, and `src/lib/analysis/schema.ts`.

> The Gemini key stays server-side. Gemini proposes exact quote pairs, time references, entities, a possible reconciliation, and an explanation. Its response schema has no confidence, severity, priority, or classification fields. Zod validates that boundary, then the application verifies both quotations against the supplied transcripts.

## 2:35–4:15 — MiniLM and deterministic scoring

Open `src/lib/analysis/embeddings.ts` and `src/lib/analysis/scoring-engine.ts`.

> Semantic similarity now comes from all-MiniLM-L6-v2 running locally through Transformers.js and ONNX. The roughly 90-megabyte model downloads once, is pre-warmed at server startup, and is reused through a module singleton. A SHA-256 keyed memory cache prevents duplicate claim embeddings.

> The scoring engine is async because embedding is async, but classification remains a deterministic decision tree. Entity overlap gates unrelated claims. Pair-aware clock normalization handles midnight rollover and chooses the conservative distance when AM/PM is unresolved, while reducing the time-certainty bonus. Hedged time differences inside 15 minutes become false positives. Opposite polarity plus similarity becomes direct. Incompatible times without direct polarity become inferential. Weak signals default to false positive.

> Confidence is the same code-owned weighted sum as before. The MiniLM change did not alter any weight or threshold, and no LLM confidence is read anywhere.

Expand **How this score was calculated** on a result.

## 4:15–5:20 — Results

Filter the live results by Direct, Inferential, and False positive. Show verified quotations, source lines, reconciliation where relevant, and the evidence-confidence factors.

## 5:20–6:25 — Tests and measured similarity

Open `src/lib/analysis/scoring-engine.test.ts` and run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

> The 31-test suite includes real local-MiniLM fixtures for all three classes plus pair-aware clock, wrapped certified-line, unnumbered speaker-block, predicate-negation, and date-scope regressions. Their expected classifications did not change. Compared with feature hashing, MiniLM recognizes the semantic relationship in the sleep timeline much more strongly, while the policy signals still determine the legal-review bucket.

Show the measured fixture values from the submission notes.

## 6:25–7:10 — Caveats

> This is production-minded for a take-home, but not ready for confidential legal matters. It still needs attorney-labeled calibration, authentication, tenant isolation, certified page and line mapping, retention controls, rate limiting, audits, and a suitable provider agreement. The similarity threshold was deliberately not retuned in this narrow embedding swap; labeled evaluation should drive that later.

End on the results screen.
