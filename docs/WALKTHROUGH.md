# Legally walkthrough script

Target length: 6–8 minutes. Record the browser and editor side by side or switch between them. Raw narration is fine.

## 0:00–0:40 — Problem and outcome

> This is Legally, a deposition contradiction review tool. The original prototype sent two hard-coded transcripts directly from the browser and treated every apparent inconsistency the same. I rebuilt it around the legal distinction between direct contradictions, inferential contradictions, and false positives. The central constraint is that the language model never supplies the confidence score.

Show the landing page and the three-type primer.

## 0:40–1:30 — Input and user experience

> A reviewer can paste or import two plain-text depositions, rename each source, and run a comparison. The included Marcus Webb fixture is synthetic. The browser sends the transcripts to a server route only when Analyze is clicked, and the application does not persist them.

Scroll through both transcript panels, then click **Analyze testimony**.

## 1:30–2:45 — Architecture

Open `src/app/api/analyze/route.ts`, `src/lib/analysis/gemini.ts`, and `src/lib/analysis/schema.ts`.

> The API key stays server-side. The request is size-limited and validated with Zod. Gemini is used as an evidence extractor: it returns verbatim quote pairs, a constrained semantic relation, alignment flags, a possible reconciliation, and an explanation. Its JSON schema does not contain confidence, severity, review priority, or a final display type. Responses are schema-validated again before they reach application logic.

Point out `responseMimeType`, `responseJsonSchema`, and the absence of a confidence field.

## 2:45–4:15 — Deterministic classification and confidence

Open `src/lib/analysis/confidence.ts`.

> The deterministic layer first verifies that both quotations actually appear in the source and derives their line numbers. Unverifiable evidence is excluded. The policy maps explicit negation and exclusive values to direct, aligned impossible facts to inferential, and compatibility or scope mismatch to false positive. There are local overrides for important cases: “all evening” versus leaving is direct, and “around 8” versus 8:05 falls inside a 15-minute human-imprecision tolerance.

> Confidence is a sum of named, code-owned factors: quote integrity, alignment, relation strength, local textual support, plus hedge and reconciliation penalties. The score is clamped to 0–99 and every factor is visible in the UI. It is classification confidence, not legal materiality or witness credibility.

Expand **How this score was calculated** on one result.

## 4:15–5:35 — Results

Show and filter the live results.

> The demonstration identifies the Daniel Cho denial, leaving home, and the changed sleep time as direct contradictions. It suppresses three near misses: driving through an area is not visiting a warehouse; being alone does not rule out a brief wave to a neighbor; and ordering pizza does not exclude buying groceries. Each card includes verified evidence, source lines, a possible reconciliation when one exists, review priority, and the deterministic score.

Click the Direct and False positives filters and show the confidence details.

## 5:35–6:20 — Testing and challenges

Open `src/lib/analysis/confidence.test.ts` and run:

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

> The main challenge was separating semantic extraction from adjudication. Models are useful for proposing evidence, but letting them emit a probability would make the score opaque and unstable. The tests therefore target policy behavior independently of Gemini and prove identical evidence produces identical scores.

## 6:20–7:10 — Caveats and next steps

> This is production-minded for a take-home, but it is not ready for confidential legal matters. Real deployment needs attorney-labeled evaluations, authentication and tenant isolation, certified page and line mapping, retention controls, rate limiting, audit logs, and a provider agreement appropriate for confidential data. PDF and OCR ingestion are also deliberately outside this four-to-five-hour scope.

End on the results screen.
