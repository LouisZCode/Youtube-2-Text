"use client";

import { useState, useRef, useEffect } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { TranscriptResult, Mode } from "@/lib/types";
import { downloadPdf } from "@/lib/api";
import { ClipboardIcon, DownloadIcon, CheckIcon } from "./icons";

function useTypewriter(text: string, charsPerFrame = 2): string {
  const [displayed, setDisplayed] = useState("");
  const [prevText, setPrevText] = useState(text);

  if (prevText !== text) {
    setPrevText(text);
    if (!text.startsWith(displayed)) setDisplayed("");
  }

  useEffect(() => {
    if (displayed.length >= text.length) return;

    let currentIndex = displayed.length;
    let rafId: number;
    const tick = () => {
      currentIndex = Math.min(currentIndex + charsPerFrame, text.length);
      setDisplayed(text.slice(0, currentIndex));
      if (currentIndex < text.length) {
        rafId = requestAnimationFrame(tick);
      }
    };
    rafId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(rafId);
    // displayed intentionally excluded — effect uses it as a one-shot starting point;
    // re-running on every setDisplayed would tear down the RAF mid-tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

const summaryComponents: Components = {
  h1: (props) => <h2 className="text-lg font-bold mt-4 mb-2 first:mt-0" {...props} />,
  h2: (props) => <h2 className="text-lg font-bold mt-4 mb-2 first:mt-0" {...props} />,
  h3: (props) => <h3 className="text-base font-bold mt-3 mb-1.5" {...props} />,
  p:  (props) => <p className="my-2 leading-relaxed" {...props} />,
  ul: (props) => <ul className="my-2 space-y-1.5" {...props} />,
  ol: (props) => <ol className="my-2 list-decimal pl-6 space-y-1.5" {...props} />,
  li: ({ children, ...props }) => (
    <li className="flex gap-2 pl-1" {...props}>
      <span className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-yt-red" />
      <span>{children}</span>
    </li>
  ),
  strong: (props) => <strong className="font-bold text-yt-red" {...props} />,
  em:     (props) => <em className="italic" {...props} />,
  code:   (props) => <code className="rounded bg-border/40 px-1 py-0.5 text-sm font-mono" {...props} />,
  table:  (props) => <table className="my-3 w-full border-collapse text-sm" {...props} />,
  th:     (props) => <th className="border border-border px-2 py-1 text-left font-bold" {...props} />,
  td:     (props) => <td className="border border-border px-2 py-1" {...props} />,
  a:      (props) => <a className="text-yt-red underline" target="_blank" rel="noopener noreferrer" {...props} />,
};

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

  const virtualizer = useVirtualizer({
    count: result.segments.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => 60,
  });

  async function handleDownload() {
    await downloadPdf({ kind: "transcript", segments: result.segments, videoId: result.video_id });
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
          isSummaryMode ? (
            <div className="text-base leading-relaxed">
              <ReactMarkdown remarkPlugins={[remarkGfm]} components={summaryComponents}>
                {visibleLlmText}
              </ReactMarkdown>
            </div>
          ) : (
            <div className="whitespace-pre-wrap text-base leading-relaxed">
              {visibleLlmText}
              {isTranslateMode && loading && (
                <span className="animate-pulse text-text-secondary"> ...</span>
              )}
            </div>
          )
        ) : (
          <div
            className="font-mono text-base leading-relaxed"
            style={{ height: virtualizer.getTotalSize(), position: "relative" }}
          >
            {virtualizer.getVirtualItems().map((virtualItem) => {
              const seg = result.segments[virtualItem.index];
              return (
                <p
                  key={virtualItem.index}
                  ref={virtualizer.measureElement}
                  data-index={virtualItem.index}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    transform: `translateY(${virtualItem.start}px)`,
                  }}
                  className="pb-4"
                >
                  <span className="font-bold text-yt-red">{seg.timestamp}</span>{" "}
                  {seg.text}
                </p>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
