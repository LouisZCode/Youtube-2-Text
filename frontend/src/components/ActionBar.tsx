"use client";

import { Mode } from "@/lib/types";
import { SparklesIcon, GlobeIcon, DownloadIcon } from "./icons";

interface ActionBarProps {
  mode: Mode;
  language: string;
  languages: Array<{ code: string; name: string }>;
  onLanguageChange: (language: string) => void;
  onSummary: () => void;
  onTranslate: () => void;
  onDownloadPdf: () => void;
  loading: boolean;
}

export default function ActionBar({
  mode,
  language,
  languages,
  onLanguageChange,
  onSummary,
  onTranslate,
  onDownloadPdf,
  loading,
}: ActionBarProps) {
  const showSummarize = mode !== "summary";

  return (
    <div className="animate-slide-up flex w-full max-w-[800px] flex-col rounded-xl border border-border bg-card">
      <div className="flex flex-col items-stretch gap-2 p-3 sm:flex-row sm:items-center">
        {showSummarize && (
          <button
            type="button"
            disabled={loading}
            onClick={onSummary}
            className="flex h-9 items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-bold transition-colors hover:border-yt-red disabled:opacity-50"
          >
            <SparklesIcon className="h-4 w-4" />
            Summarize
          </button>
        )}
        <div className="flex flex-1 items-center gap-2">
          <select
            value={language}
            onChange={(e) => onLanguageChange(e.target.value)}
            disabled={loading}
            className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-yt-red disabled:opacity-50"
          >
            {languages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={loading}
            onClick={onTranslate}
            className="flex h-9 items-center justify-center gap-2 rounded-lg bg-yt-red px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
          >
            <GlobeIcon className="h-4 w-4" />
            Translate
          </button>
        </div>
      </div>

      <div className="border-t border-border p-3">
        <button
          type="button"
          disabled={loading}
          onClick={onDownloadPdf}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg border border-border bg-background px-4 text-sm font-bold transition-colors hover:border-yt-red disabled:opacity-50"
        >
          <DownloadIcon className="h-4 w-4" />
          Download PDF
        </button>
      </div>
    </div>
  );
}
