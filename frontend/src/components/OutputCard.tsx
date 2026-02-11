"use client";

import { useState, useRef, useEffect } from "react";
import { TranscriptResult, Mode } from "@/lib/types";
import { downloadPdf } from "@/lib/api";
import { ClipboardIcon, DownloadIcon, CheckIcon } from "./icons";

function useTypewriter(text: string, charsPerFrame = 2): string {
  const [displayed, setDisplayed] = useState("");
  const indexRef = useRef(0);

  useEffect(() => {
    if (text.length === 0) {
      indexRef.current = 0;
      setDisplayed("");
      return;
    }
    if (indexRef.current >= text.length) return;

    let rafId: number;
    const tick = () => {
      indexRef.current = Math.min(indexRef.current + charsPerFrame, text.length);
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current < text.length) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
  }, [text, charsPerFrame]);

  return displayed;
}

interface OutputCardProps {
  result: TranscriptResult;
  mode: Mode;
  loading: boolean;
  summary?: string | null;
  translation?: string | null;
  elapsedSeconds?: number | null;
}

export default function OutputCard({ result, mode, loading, summary, translation, elapsedSeconds }: OutputCardProps) {
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const userScrolledRef = useRef(false);

  const isSummaryMode = mode === "summary";
  const isTranslateMode = mode === "translate";
  const isLlmMode = isSummaryMode || isTranslateMode;
  const showPdf = mode === "pro";

  const fullText = result.segments
    .map((s) => `${s.timestamp} ${s.text}`)
    .join("\n\n");

  const llmText = isSummaryMode ? (summary ?? "") : isTranslateMode ? (translation ?? "") : "";
  const typedText = useTypewriter(translation ?? "", 6);
  const visibleLlmText = isTranslateMode ? typedText : llmText;
  const displayText = isLlmMode ? llmText : fullText;

  // Reset user-scrolled flag when a new translation starts
  useEffect(() => {
    if (isTranslateMode && loading) {
      userScrolledRef.current = false;
    }
  }, [isTranslateMode, loading]);

  // Auto-scroll while typewriter is running, unless user scrolled
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isTranslateMode || userScrolledRef.current) return;
    el.scrollTop = el.scrollHeight;
  }, [visibleLlmText, isTranslateMode]);

  async function handleCopy() {
    await navigator.clipboard.writeText(displayText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleDownload() {
    await downloadPdf(result.segments);
  }

  return (
    <div className="animate-slide-up w-full max-w-[800px] overflow-hidden rounded-xl border border-border bg-card">
      {/* Loading bar */}
      {loading && (
        <div className="h-1 w-full overflow-hidden bg-border">
          <div className="animate-indeterminate h-full w-1/4 rounded bg-yt-red" />
        </div>
      )}

      {/* Header + Actions */}
      <div className="flex items-center justify-between border-b border-border px-5 py-3">
        <span className="text-base font-bold">
          {isSummaryMode ? "Summary" : isTranslateMode ? "Translation" : "Transcript"}
        </span>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={handleCopy}
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-border/50"
              aria-label={isSummaryMode ? "Copy summary" : isTranslateMode ? "Copy translation" : "Copy transcript"}
            >
              {copied ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <ClipboardIcon className="h-4 w-4" />
              )}
            </button>
            {copied && (
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-sm text-background">
                Copied!
              </span>
            )}
          </div>
          {showPdf && (
            <button
              onClick={handleDownload}
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-border/50"
              aria-label="Download PDF"
            >
              <DownloadIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Meta info — transcript modes only */}
      {!isLlmMode && (
        <div className="flex gap-4 border-b border-border px-5 py-2 text-sm text-text-secondary">
          <span>{result.word_count.toLocaleString()} words</span>
          {elapsedSeconds != null && <span>in {elapsedSeconds}s</span>}
        </div>
      )}

      {/* Content */}
      <div
        ref={scrollRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 30;
          userScrolledRef.current = !atBottom;
        }}
        className="max-h-[480px] overflow-y-auto px-5 py-4"
      >
        {isLlmMode ? (
          <div className="whitespace-pre-wrap text-base leading-relaxed">
            {visibleLlmText}
            {isTranslateMode && loading && (
              <span className="animate-pulse text-text-secondary"> ...</span>
            )}
          </div>
        ) : (
          <div className="space-y-4 font-mono text-base leading-relaxed">
            {result.segments.map((seg, i) => (
              <p key={i}>
                <span className="font-bold text-yt-red">{seg.timestamp}</span>{" "}
                {seg.text}
              </p>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
