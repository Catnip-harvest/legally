# Legally video walkthrough script

Target length: 7-9 minutes. This is written for a raw screen recording with narration; no editing is required.

## Before recording

- Start the app and wait for the terminal to say the local MiniLM model is ready.
- Open [http://localhost:3000](http://localhost:3000) with the included demonstration loaded.
- Open the repository in your editor with these files easy to reach:
  - `README.md`
  - `src/lib/analysis/schema.ts`
  - `src/lib/analysis/gemini.ts`
  - `src/lib/analysis/confidence.ts`
  - `src/lib/analysis/scoring-engine.ts`
  - `src/lib/analysis/embeddings.ts`
  - `src/lib/analysis/scoring-engine.test.ts`
- Increase the editor and terminal font size enough for the recording.
- Never open `.env.local` or show the Gemini API key.
- Keep the current successful result available as a fallback in case the live API is rate-limited during recording.

## 0:00-0:35 - Introduction

**Show:** The landing page and the three category cards.

**Say:**

> Hi, this is Legally, a deposition contradiction review tool. It compares two transcripts from the same witness and separates possible inconsistencies into direct contradictions, inferential contradictions, and false positives. The main requirement I designed around is that the language model cannot supply confidence. Gemini finds candidate evidence, while deterministic application code owns classification and every confidence point.

## 0:35-1:15 - Explain the problem

**Show:** Scroll between the Direct, Inferential, and False positive descriptions.

**Say:**

> These categories matter because they should not be presented to a lawyer with the same urgency. A direct contradiction expressly changes a fact, such as staying home all evening versus leaving for groceries. An inferential contradiction needs combined context, such as incompatible bedtime accounts. A false positive may be ordinary imprecision or a difference in scope. The system defaults weak evidence to the least alarming category because excessive false alarms destroy reviewer trust.

## 1:15-2:15 - Run the product

**Show:** The two synthetic Marcus Webb transcripts, then click **Analyze testimony** once.

**Say while it runs:**

> A reviewer can paste or import two text transcripts. The browser sends them to one server-side analysis route. The application does not persist the testimony, and the Gemini API key never reaches the browser.

**Show after the result appears:** The summary counts.

**Say:**

> On this benchmark, Gemini 3.5 Flash proposed five candidates. Four have verified source quotations and enter the queue; one unsupported candidate is excluded. The verified set contains two direct contradictions, one inferential contradiction, and one false positive.

## 2:15-3:20 - Walk through the results

**Show:** Open the home-versus-groceries direct finding and expand **How this score was calculated**.

**Say:**

> This first result compares being home all evening with briefly leaving for groceries. The quotes are verified against their respective transcripts and mapped back to source lines. The score explanation is auditable: local semantic similarity, entity overlap, polarity, parseable time evidence, and a hedge penalty. These are code-owned features; the model never returned seventy-seven percent.

**Show:** Filter to Inferential and open the bedtime result.

**Say:**

> The bedtime pair is inferential because there is no simple positive-versus-negative assertion. Pair-aware time normalization combines the estimates and finds a conservative ninety-minute gap. Ambiguous AM or PM receives only half of the full time bonus.

**Show:** Filter to False positives and point at the reconciliation.

**Say:**

> The neighbor interaction is kept as a false positive with a possible reconciliation. The witness could have been alone inside the home and still briefly waved to someone outside. Keeping the dismissed candidate visible makes the de-escalation reviewable.

## 3:20-4:15 - Show the architecture

**Show:** The Mermaid diagram near the top of `README.md`.

**Say:**

> The architecture is a deliberately narrow hybrid pipeline. Two transcripts enter the API route. Gemini performs candidate extraction. Zod validates its structured response. The application verifies every quote. MiniLM calculates semantic similarity locally, and a deterministic scoring engine produces the final category, confidence, and review priority.

> I used a single Gemini extraction call for this two-transcript take-home to control cost, latency, and failure points. For much larger matters, I would consider a separate atomic-claim extraction and candidate-retrieval stage.

## 4:15-5:05 - Explain the model boundary

**Show:** `src/lib/analysis/schema.ts`, especially `modelCandidateSchema`, then `src/lib/analysis/gemini.ts`.

**Say:**

> This schema is the enforcement boundary. Gemini can return a topic, two verbatim quotes, time references, canonical entities, an explanation, and an optional reconciliation. There is intentionally no field for classification, confidence, severity, priority, probability, or legal conclusion. The response is constrained with JSON Schema and validated again with Zod.

> The configured extraction model is the stable Gemini 3.5 Flash model. The request has a provider timeout, a maximum output size, and structured error handling for authentication, rate limits, timeouts, invalid JSON, and schema failures.

## 5:05-5:50 - Explain quote verification

**Show:** `locateQuote()` in `src/lib/analysis/confidence.ts`.

**Say:**

> A verbatim-quote instruction is not enough, so every candidate is checked against the original source. The verifier first tries an exact match, then performs conservative punctuation and whitespace normalization for wrapped deposition lines. It understands common Q-and-A, certified line-number, and multi-line witness formats. If either quote is missing, the pair is excluded rather than displayed as evidence.

## 5:50-6:50 - Explain scoring and local embeddings

**Show:** `SCORING_CONFIG` and the decision tree in `src/lib/analysis/scoring-engine.ts`, then `src/lib/analysis/embeddings.ts`.

**Say:**

> All policy constants are named in one configuration object. Low entity overlap discards unrelated claims. A small hedged time difference becomes a false positive. Opposite polarity on a sufficiently similar topic becomes direct. An incompatible timeline without direct opposition becomes inferential. Weak evidence defaults to false positive.

> Confidence is a clamped weighted sum of semantic similarity, entity overlap, polarity, time evidence, and hedge language. Semantic similarity comes from all-MiniLM-L6-v2 running locally through Transformers.js and ONNX. It loads once, is pre-warmed at server startup, and caches embeddings by a SHA-256 hash of the claim text. There is no embedding API request inside the scoring function.

## 6:50-7:35 - Tests and challenges

**Show:** `src/lib/analysis/scoring-engine.test.ts`, then run the commands below in the terminal.

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

**Say:**

> The suite has thirty-one tests covering all three classifications, the weighted confidence formula, MiniLM cache behavior, quote verification, natural hedge and negation language, midnight rollover, unresolved AM or PM, multiple time estimates, wrapped testimony, and attempts to inject model confidence.

> The hardest challenges were keeping probabilistic extraction separate from deterministic judgment and handling natural testimony without over-engineering a full legal NLP parser. For example, the time parser originally treated an unlabeled 7:30 as morning even when paired with 7 PM. Pair-aware clock resolution and regression cases fixed that while preserving conservative confidence.

## 7:35-8:25 - Caveats and next steps

**Show:** `README.md` under **Known limitations**.

**Say:**

> This is production-minded for a take-home, but I would not describe it as an autonomous production legal system. Candidate recall still depends on Gemini surfacing the right pair, and some testimony is genuinely context-dependent. Before confidential client use, I would add an attorney-labeled evaluation set, authentication and tenant isolation, certified PDF page and line mapping, encryption and retention controls, rate limiting, audit logs, monitoring, and explicit human acceptance or rejection.

> The correct production claim is that Legally assists attorney review; it does not make legal conclusions. Passing the frozen regression suite is measurable, but no model can guarantee perfect accuracy on every unseen deposition.

## 8:25-8:45 - Close

**Show:** Return to the result screen, with all four findings visible.

**Say:**

> In summary, Legally uses Gemini for flexible evidence discovery, verifies that evidence against the source, and reserves classification and confidence for transparent, tested application logic. The complete source, setup instructions, architecture notes, and tests are available in the GitHub repository linked with this submission. Thanks for reviewing it.

## Recording and submission checklist

- Confirm your microphone is audible for the first ten seconds.
- Record at 1080p if available; raw recording is acceptable.
- Show the GitHub repository URL at least once.
- Do not show `.env.local`, the API key, browser developer storage, or terminal environment variables.
- Upload the video as unlisted on YouTube, Loom, Google Drive, or another link the reviewer can open without requesting access.
- Open the uploaded link in a private/incognito window before submitting it.
- Submit both links:
  - Repository: `https://github.com/Catnip-harvest/legally`
  - Video: replace this line with your uploaded recording URL.
