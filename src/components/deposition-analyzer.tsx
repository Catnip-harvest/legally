"use client";

import { useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  DEMO_LABEL_A,
  DEMO_LABEL_B,
  DEMO_TRANSCRIPT_A,
  DEMO_TRANSCRIPT_B,
} from "@/data/demo";
import type {
  AnalysisPayload,
  AnalysisResult,
  Classification,
} from "@/lib/analysis/schema";

type Filter = "ALL" | Classification;

const TYPE_DETAILS: Record<
  Classification,
  { label: string; shortLabel: string; accent: string; soft: string; text: string }
> = {
  DIRECT: {
    label: "Direct contradiction",
    shortLabel: "Direct",
    accent: "#a43b32",
    soft: "#f7e9e6",
    text: "#852e27",
  },
  INFERENTIAL: {
    label: "Inferential contradiction",
    shortLabel: "Inferential",
    accent: "#9a671f",
    soft: "#f7efdd",
    text: "#755018",
  },
  FALSE_POSITIVE: {
    label: "False positive",
    shortLabel: "False positive",
    accent: "#66746d",
    soft: "#ebeeec",
    text: "#44534b",
  },
};

function ScaleMark({ className = "h-5 w-5" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 3v17M6 6h12M8 6 4 13h8L8 6Zm8 0-4 7h8l-4-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 13c.4 2 1.9 3 4.5 3s4.1-1 4.5-3M11 20h2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2c.5 4.5 2.8 7 7 7-4.2 0-6.5 2.5-7 7-.5-4.5-2.8-7-7-7 4.2 0 6.5-2.5 7-7Z" fill="currentColor" />
    </svg>
  );
}

function UploadIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 13V3m0 0L6.5 6.5M10 3l3.5 3.5M4 12v3.5c0 .8.7 1.5 1.5 1.5h9c.8 0 1.5-.7 1.5-1.5V12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg className="h-4 w-4" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4 10h12m-4-4 4 4-4 4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path d="m3 8.5 3 3L13 4.75" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TranscriptPanel({
  marker,
  label,
  transcript,
  onLabelChange,
  onTranscriptChange,
  onFile,
}: {
  marker: "A" | "B";
  label: string;
  transcript: string;
  onLabelChange: (value: string) => void;
  onTranscriptChange: (value: string) => void;
  onFile: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const inputId = `transcript-file-${marker.toLowerCase()}`;

  return (
    <section className="overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_1px_0_rgba(23,34,29,0.04)]">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--line)] px-5 py-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--evergreen)] text-[11px] font-bold text-white">
            {marker}
          </span>
          <input
            aria-label={`${marker === "A" ? "Earlier" : "Later"} testimony label`}
            className="focus-ring min-w-0 flex-1 rounded border-0 bg-transparent text-sm font-semibold text-[var(--ink)] outline-none"
            value={label}
            maxLength={80}
            onChange={(event) => onLabelChange(event.target.value)}
          />
        </div>
        <label
          htmlFor={inputId}
          className="focus-ring flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-semibold text-[var(--muted)] transition hover:bg-[var(--paper)] hover:text-[var(--ink)]"
        >
          <UploadIcon /> Import .txt
        </label>
        <input
          id={inputId}
          className="sr-only"
          type="file"
          accept=".txt,.md,text/plain,text/markdown"
          onChange={onFile}
        />
      </div>
      <textarea
        data-testid={`transcript-${marker.toLowerCase()}`}
        aria-label={`${marker === "A" ? "Earlier" : "Later"} deposition transcript`}
        className="transcript-scrollbar focus-ring block min-h-[360px] w-full resize-y border-0 bg-[var(--surface)] px-5 py-5 font-mono text-[13px] leading-[1.72] text-[#2f3934] outline-none placeholder:text-[#9ba39e] lg:min-h-[410px]"
        placeholder="Paste deposition testimony here…"
        value={transcript}
        maxLength={40_000}
        spellCheck={false}
        onChange={(event) => onTranscriptChange(event.target.value)}
      />
      <div className="flex items-center justify-between border-t border-[var(--line)] bg-[#fbfaf6] px-5 py-2.5 text-[11px] text-[var(--muted)]">
        <span>{transcript.split("\n").length} lines</span>
        <span>{transcript.length.toLocaleString()} / 40,000 characters</span>
      </div>
    </section>
  );
}

function TypePrimer({
  index,
  title,
  children,
  tone,
}: {
  index: string;
  title: string;
  children: ReactNode;
  tone: "red" | "amber" | "slate";
}) {
  const tones = {
    red: "bg-[var(--red-light)] text-[var(--red)]",
    amber: "bg-[var(--amber-light)] text-[var(--amber)]",
    slate: "bg-[var(--slate-light)] text-[var(--slate)]",
  };

  return (
    <div className="flex gap-3.5">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${tones[tone]}`}>
        {index}
      </span>
      <div>
        <h3 className="text-sm font-bold text-[var(--ink)]">{title}</h3>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{children}</p>
      </div>
    </div>
  );
}

function EvidenceBlock({
  marker,
  label,
  evidence,
}: {
  marker: "A" | "B";
  label: string;
  evidence: AnalysisResult["evidenceA"];
}) {
  return (
    <div className="rounded-xl border border-[#e2dfd7] bg-[#fbfaf6] p-4">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[#dfe7e2] text-[9px] font-bold text-[var(--evergreen)]">
            {marker}
          </span>
          <span className="truncate text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
            {label}
          </span>
        </div>
        {evidence.line && (
          <span className="shrink-0 font-mono text-[10px] text-[#879089]">Line {evidence.line}</span>
        )}
      </div>
      <blockquote className="font-mono text-[12px] leading-6 text-[#303a35]">
        “{evidence.quote}”
      </blockquote>
      <div className="mt-3 flex items-center gap-1 text-[10px] font-semibold text-[#47705d]">
        <CheckIcon /> Verified in source
      </div>
    </div>
  );
}

function FindingCard({
  result,
  labelA,
  labelB,
  index,
}: {
  result: AnalysisResult;
  labelA: string;
  labelB: string;
  index: number;
}) {
  const detail = TYPE_DETAILS[result.classification];

  return (
    <article
      className="result-enter overflow-hidden rounded-[18px] border border-[var(--line)] bg-[var(--surface)] shadow-[0_4px_20px_rgba(23,34,29,0.035)]"
      style={{ animationDelay: `${Math.min(index * 45, 240)}ms` }}
    >
      <div className="h-1" style={{ background: detail.accent }} />
      <div className="p-5 sm:p-6">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-start">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className="rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.09em]"
                style={{ background: detail.soft, color: detail.text }}
              >
                {detail.label}
              </span>
              <span className="rounded-full border border-[#dedbd3] px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.09em] text-[var(--muted)]">
                {result.reviewPriority === "DISMISS"
                  ? "No review priority"
                  : `${result.reviewPriority} review priority`}
              </span>
            </div>
            <h3 className="display-font mt-3 text-[25px] leading-tight text-[var(--ink)]">{result.topic}</h3>
          </div>
          <div className="flex shrink-0 items-center gap-3 rounded-xl border border-[#dedbd3] bg-[#fbfaf6] px-3.5 py-2.5">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.08em] text-[var(--muted)]">
                Evidence confidence
              </div>
              <div className="mt-0.5 text-xs font-semibold text-[var(--ink)]">{result.confidenceLabel}</div>
            </div>
            <div className="text-2xl font-bold tabular-nums text-[var(--evergreen)]">{result.confidence}%</div>
          </div>
        </div>

        <p className="mt-4 max-w-3xl text-sm leading-6 text-[#4e5b54]">{result.explanation}</p>

        <div className="mt-5 grid gap-3 md:grid-cols-2">
          <EvidenceBlock marker="A" label={labelA} evidence={result.evidenceA} />
          <EvidenceBlock marker="B" label={labelB} evidence={result.evidenceB} />
        </div>

        {result.reconciliation && result.classification === "FALSE_POSITIVE" && (
          <div className="mt-4 rounded-xl border border-[#e4decf] bg-[#faf5e9] px-4 py-3 text-xs leading-5 text-[#685a37]">
            <strong>Possible reconciliation:</strong> {result.reconciliation}
          </div>
        )}

        <details className="group mt-4 border-t border-[#e6e3dc] pt-4">
          <summary className="focus-ring flex cursor-pointer list-none items-center justify-between rounded text-xs font-bold text-[var(--evergreen)]">
            <span>How this score was calculated</span>
            <span className="text-base transition group-open:rotate-45">+</span>
          </summary>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            {result.factors.map((factor) => (
              <div key={`${factor.label}-${factor.impact}`} className="flex gap-3 rounded-lg bg-[#f6f4ee] p-3">
                <span className={`w-8 shrink-0 text-right font-mono text-xs font-bold ${factor.impact < 0 ? "text-[var(--red)]" : "text-[var(--evergreen)]"}`}>
                  {factor.impact > 0 ? "+" : ""}{factor.impact}
                </span>
                <div>
                  <div className="text-[11px] font-bold text-[var(--ink)]">{factor.label}</div>
                  <div className="mt-0.5 text-[10px] leading-4 text-[var(--muted)]">{factor.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </details>
      </div>
    </article>
  );
}

function Results({
  payload,
  filter,
  onFilter,
  labelA,
  labelB,
}: {
  payload: AnalysisPayload;
  filter: Filter;
  onFilter: (filter: Filter) => void;
  labelA: string;
  labelB: string;
}) {
  const visibleResults = useMemo(
    () =>
      filter === "ALL"
        ? payload.results
        : payload.results.filter((result) => result.classification === filter),
    [filter, payload.results],
  );
  const filters: Array<{ value: Filter; label: string; count: number }> = [
    { value: "ALL", label: "All findings", count: payload.results.length },
    { value: "DIRECT", label: "Direct", count: payload.summary.direct },
    { value: "INFERENTIAL", label: "Inferential", count: payload.summary.inferential },
    { value: "FALSE_POSITIVE", label: "False positives", count: payload.summary.falsePositive },
  ];

  return (
    <section id="results" data-testid="results" className="mt-10 scroll-mt-24">
      <div className="flex flex-col justify-between gap-5 border-b border-[var(--line)] pb-5 md:flex-row md:items-end">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--evergreen)]">Review queue</div>
          <h2 className="display-font mt-2 text-4xl text-[var(--ink)]">Analysis findings</h2>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {payload.results.length} verified candidate{payload.results.length === 1 ? "" : "s"} · {payload.summary.rejectedCandidates} unverified model candidate{payload.summary.rejectedCandidates === 1 ? "" : "s"} excluded
          </p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <div className="rounded-xl bg-[var(--red-light)] px-4 py-2.5 text-center">
            <div className="text-xl font-bold text-[var(--red)]">{payload.summary.direct}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--red)]">Direct</div>
          </div>
          <div className="rounded-xl bg-[var(--amber-light)] px-4 py-2.5 text-center">
            <div className="text-xl font-bold text-[var(--amber)]">{payload.summary.inferential}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--amber)]">Inferred</div>
          </div>
          <div className="rounded-xl bg-[var(--slate-light)] px-4 py-2.5 text-center">
            <div className="text-xl font-bold text-[var(--slate)]">{payload.summary.falsePositive}</div>
            <div className="text-[9px] font-bold uppercase tracking-wider text-[var(--slate)]">Dismiss</div>
          </div>
        </div>
      </div>

      <div className="my-5 flex gap-2 overflow-x-auto pb-1" aria-label="Filter findings">
        {filters.map((item) => (
          <button
            key={item.value}
            type="button"
            aria-pressed={filter === item.value}
            className={`focus-ring shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold transition ${filter === item.value ? "border-[var(--evergreen)] bg-[var(--evergreen)] text-white" : "border-[var(--line)] bg-[var(--surface)] text-[var(--muted)] hover:border-[#a9afa9] hover:text-[var(--ink)]"}`}
            onClick={() => onFilter(item.value)}
          >
            {item.label} <span className="ml-1 opacity-70">{item.count}</span>
          </button>
        ))}
      </div>

      {visibleResults.length ? (
        <div className="grid gap-4">
          {visibleResults.map((result, index) => (
            <FindingCard key={result.id} result={result} labelA={labelA} labelB={labelB} index={index} />
          ))}
        </div>
      ) : (
        <div className="rounded-[18px] border border-dashed border-[#c8c7c0] bg-white/45 px-6 py-14 text-center">
          <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-[var(--evergreen-light)] text-[var(--evergreen)]"><CheckIcon /></div>
          <h3 className="mt-4 text-sm font-bold">No findings in this category</h3>
          <p className="mt-1 text-xs text-[var(--muted)]">Try another filter or review the submitted testimony.</p>
        </div>
      )}

      <p className="mt-4 text-right text-[10px] text-[#7f8882]">
        Analyzed {new Date(payload.meta.analyzedAt).toLocaleString()} · {payload.meta.model}
      </p>
    </section>
  );
}

export function DepositionAnalyzer() {
  const [transcriptA, setTranscriptA] = useState(DEMO_TRANSCRIPT_A);
  const [transcriptB, setTranscriptB] = useState(DEMO_TRANSCRIPT_B);
  const [labelA, setLabelA] = useState(DEMO_LABEL_A);
  const [labelB, setLabelB] = useState(DEMO_LABEL_B);
  const [payload, setPayload] = useState<AnalysisPayload | null>(null);
  const [filter, setFilter] = useState<Filter>("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const requestRef = useRef<AbortController | null>(null);

  const ready = transcriptA.trim().length >= 40 && transcriptB.trim().length >= 40;

  function resetResults() {
    setPayload(null);
    setError(null);
  }

  function loadDemo() {
    requestRef.current?.abort();
    setTranscriptA(DEMO_TRANSCRIPT_A);
    setTranscriptB(DEMO_TRANSCRIPT_B);
    setLabelA(DEMO_LABEL_A);
    setLabelB(DEMO_LABEL_B);
    setPayload(null);
    setFilter("ALL");
    setError(null);
    setLoading(false);
  }

  async function importFile(
    event: ChangeEvent<HTMLInputElement>,
    setTranscript: (value: string) => void,
    setLabel: (value: string) => void,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 100_000) {
      setError("Text files must be smaller than 100 KB.");
      return;
    }
    const text = await file.text();
    setTranscript(text.slice(0, 40_000));
    setLabel(file.name.replace(/\.(txt|md)$/i, ""));
    resetResults();
  }

  async function analyze() {
    if (!ready || loading) return;

    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setLoading(true);
    setError(null);
    setPayload(null);
    setFilter("ALL");

    try {
      const response = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcriptA, transcriptB, labelA, labelB }),
        signal: controller.signal,
      });
      const body = (await response.json()) as AnalysisPayload & {
        error?: { message?: string };
      };
      if (!response.ok) {
        throw new Error(body.error?.message || "Analysis failed. Please retry.");
      }
      setPayload(body);
      window.setTimeout(() => {
        document.getElementById("results")?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    } catch (caught) {
      if (caught instanceof DOMException && caught.name === "AbortError") return;
      setError(caught instanceof Error ? caught.message : "Analysis failed. Please retry.");
    } finally {
      if (requestRef.current === controller) {
        requestRef.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-[var(--line)] bg-[rgba(244,242,236,0.88)] backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-[1320px] items-center justify-between px-5 sm:px-8">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--evergreen)] text-white"><ScaleMark /></span>
            <span className="text-[15px] font-black uppercase tracking-[0.18em] text-[var(--ink)]">Legally</span>
          </div>
          <div className="hidden items-center gap-2 text-[10px] font-bold uppercase tracking-[0.1em] text-[var(--muted)] sm:flex">
            <span className="h-1.5 w-1.5 rounded-full bg-[#4d846b]" /> AI-assisted evidence review
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[1320px] px-5 pb-16 pt-10 sm:px-8 sm:pt-14">
        <section className="grid gap-8 lg:grid-cols-[1.35fr_0.65fr] lg:items-end">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-[var(--evergreen)]">Deposition consistency analysis</div>
            <h1 className="display-font mt-4 max-w-4xl text-5xl leading-[0.98] text-[var(--ink)] sm:text-6xl lg:text-[72px]">
              When the story changes, <span className="italic text-[var(--evergreen)]">see exactly how.</span>
            </h1>
            <p className="mt-5 max-w-2xl text-[15px] leading-7 text-[var(--muted)]">
              Compare sworn testimony, separate real contradictions from human imprecision, and inspect every confidence point before you rely on it.
            </p>
          </div>
          <aside className="rounded-[18px] border border-[var(--line)] bg-[rgba(255,254,250,0.65)] p-5">
            <div className="flex items-center gap-2 text-xs font-bold text-[var(--evergreen)]"><SparkIcon /> Model finds evidence. Policy owns the score.</div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Gemini cannot return confidence or severity. Legally verifies quotations and applies published, deterministic rules.
            </p>
          </aside>
        </section>

        <section className="mt-10">
          <div className="mb-4 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
            <div>
              <h2 className="text-sm font-bold text-[var(--ink)]">Source testimony</h2>
              <p className="mt-1 text-xs text-[var(--muted)]">Paste plain text or import a .txt file. This application does not persist submitted text.</p>
            </div>
            <button type="button" className="focus-ring self-start rounded-md px-3 py-2 text-xs font-bold text-[var(--evergreen)] transition hover:bg-[var(--evergreen-light)]" onClick={loadDemo}>
              Reload demonstration
            </button>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <TranscriptPanel
              marker="A"
              label={labelA}
              transcript={transcriptA}
              onLabelChange={(value) => { setLabelA(value); resetResults(); }}
              onTranscriptChange={(value) => { setTranscriptA(value); resetResults(); }}
              onFile={(event) => importFile(event, setTranscriptA, setLabelA)}
            />
            <TranscriptPanel
              marker="B"
              label={labelB}
              transcript={transcriptB}
              onLabelChange={(value) => { setLabelB(value); resetResults(); }}
              onTranscriptChange={(value) => { setTranscriptB(value); resetResults(); }}
              onFile={(event) => importFile(event, setTranscriptB, setLabelB)}
            />
          </div>

          <div className="mt-4 flex flex-col items-stretch justify-between gap-4 rounded-[18px] bg-[var(--evergreen)] px-5 py-4 text-white sm:flex-row sm:items-center">
            <div>
              <div className="text-xs font-bold">Ready for comparison</div>
              <div className="mt-1 text-[11px] text-[#bdd0c7]">Your API key stays server-side. Testimony is sent only when you analyze.</div>
            </div>
            <button
              data-testid="analyze-button"
              type="button"
              disabled={!ready || loading}
              className="focus-ring flex min-w-[190px] items-center justify-center gap-2 rounded-xl bg-[#fffefa] px-5 py-3 text-sm font-bold text-[var(--evergreen)] transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-50"
              onClick={analyze}
            >
              {loading ? (
                <><span className="h-4 w-4 animate-spin rounded-full border-2 border-[#9eb5aa] border-t-[var(--evergreen)]" /> Reviewing testimony…</>
              ) : (
                <>Analyze testimony <ArrowIcon /></>
              )}
            </button>
          </div>

          {error && (
            <div role="alert" className="mt-4 rounded-xl border border-[#e5bbb5] bg-[var(--red-light)] px-4 py-3 text-sm text-[var(--red)]">
              <strong>Analysis could not complete.</strong> {error}
            </div>
          )}
        </section>

        {payload ? (
          <Results payload={payload} filter={filter} onFilter={setFilter} labelA={labelA} labelB={labelB} />
        ) : (
          <section className="paper-grid mt-10 rounded-[18px] border border-[var(--line)] bg-[rgba(255,254,250,0.5)] p-6 sm:p-8">
            <div className="grid gap-7 md:grid-cols-3">
              <TypePrimer index="01" title="Direct" tone="red">One statement expressly negates or replaces the other.</TypePrimer>
              <TypePrimer index="02" title="Inferential" tone="amber">The statements sound possible alone but cannot coexist.</TypePrimer>
              <TypePrimer index="03" title="False positive" tone="slate">Scope, context, or ordinary imprecision resolves the apparent conflict.</TypePrimer>
            </div>
          </section>
        )}
      </main>

      <footer className="border-t border-[var(--line)] px-5 py-7 text-center text-[10px] leading-5 text-[var(--muted)] sm:px-8">
        Legally supports attorney review; it does not make legal conclusions. Always verify findings against the certified record.
      </footer>
    </div>
  );
}
