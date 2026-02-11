"use client";

import { useState } from "react";
import { TranscriptResult, Mode } from "@/lib/types";
import { downloadPdf } from "@/lib/api";
import { ClipboardIcon, DownloadIcon, CheckIcon } from "./icons";

interface OutputCardProps {
  result: TranscriptResult;
  mode: Mode;
  loading: boolean;
  summary?: string | null;
}

export default function OutputCard({ result, mode, loading, summary }: OutputCardProps) {
  const [copied, setCopied] = useState(false);

  const isSummaryMode = mode === "summary";
  const showPdf = mode === "pro";

  const fullText = result.segments
    .map((s) => `${s.timestamp} ${s.text}`)
    .join("\n\n");

  const displayText = isSummaryMode ? (summary ?? "") : fullText;

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
        <span className="text-sm font-bold">
          {isSummaryMode ? "Summary" : "Transcript"}
        </span>

        <div className="flex items-center gap-2">
          <div className="relative">
            <button
              onClick={handleCopy}
              className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-border/50"
              aria-label={isSummaryMode ? "Copy summary" : "Copy transcript"}
            >
              {copied ? (
                <CheckIcon className="h-4 w-4 text-green-500" />
              ) : (
                <ClipboardIcon className="h-4 w-4" />
              )}
            </button>
            {copied && (
              <span className="absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded bg-foreground px-2 py-1 text-xs text-background">
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
      {!isSummaryMode && (
        <div className="flex gap-4 border-b border-border px-5 py-2 text-xs text-text-secondary">
          <span>{result.word_count.toLocaleString()} words</span>
          <span>Source: {result.source === "captions" ? "Captions" : "Audio transcription"}</span>
        </div>
      )}

      {/* Content */}
      <div className="max-h-[480px] overflow-y-auto px-5 py-4">
        {isSummaryMode ? (
          <div className="whitespace-pre-wrap text-sm leading-relaxed">
            {summary}
          </div>
        ) : (
          <div className="space-y-4 font-mono text-sm leading-relaxed">
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
