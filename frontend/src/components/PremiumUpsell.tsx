"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { DownloadIcon, SparklesIcon, GlobeIcon } from "./icons";
import PremiumGateModal from "./PremiumGateModal";

interface PremiumUpsellProps {
  language: string;
  languages: string[];
  onLanguageChange: (language: string) => void;
  onDownloadPdf: () => void;
  onSummary: () => void;
  onTranslate: () => void;
  loading: boolean;
}

export default function PremiumUpsell({
  language,
  languages,
  onLanguageChange,
  onDownloadPdf,
  onSummary,
  onTranslate,
  loading,
}: PremiumUpsellProps) {
  const { user } = useAuth();
  const [hoveredCard, setHoveredCard] = useState<"pdf" | "summary" | "translate" | null>(null);
  const [showGate, setShowGate] = useState(false);

  const isPremium = user?.tier === "premium";

  function handlePremiumClick(action: () => void) {
    if (!isPremium) {
      setTimeout(() => setShowGate(true), 500);
      return;
    }
    action();
  }

  return (
    <div className="animate-slide-up w-full max-w-[800px]">
      <p className="mb-4 text-center text-base text-text-secondary">
        Do more with your transcript
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Download PDF card — free */}
        <button
          type="button"
          disabled={loading}
          onClick={onDownloadPdf}
          onMouseEnter={() => setHoveredCard("pdf")}
          onMouseLeave={() => setHoveredCard(null)}
          className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-yt-red/40 hover:shadow-sm disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <DownloadIcon
              className={`h-5 w-5 transition-colors ${
                hoveredCard === "pdf" ? "text-yt-red" : "text-text-secondary"
              }`}
            />
            <span className="text-base font-bold">Download PDF</span>
            <span className="rounded-full bg-green-500/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-green-600 dark:text-green-400">
              Free
            </span>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">
            Download the full transcript as a formatted PDF file.
          </p>
        </button>

        {/* Summary card */}
        <button
          type="button"
          disabled={loading}
          onClick={() => handlePremiumClick(onSummary)}
          onMouseEnter={() => setHoveredCard("summary")}
          onMouseLeave={() => setHoveredCard(null)}
          className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 text-left transition-all hover:border-yt-red/40 hover:shadow-sm disabled:opacity-50"
        >
          <div className="flex items-center gap-2">
            <SparklesIcon
              className={`h-5 w-5 transition-colors ${
                hoveredCard === "summary" ? "text-yt-red" : "text-text-secondary"
              }`}
            />
            <span className="text-base font-bold">Summarize</span>
            <span className="rounded-full bg-yt-red/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yt-red">
              Premium
            </span>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">
            Get a concise AI-powered summary of the entire video content.
          </p>
        </button>

        {/* Translate card */}
        <div
          onMouseEnter={() => setHoveredCard("translate")}
          onMouseLeave={() => setHoveredCard(null)}
          className="group flex flex-col items-start gap-3 rounded-xl border border-border bg-card p-5 transition-all hover:border-yt-red/40 hover:shadow-sm"
        >
          <div className="flex items-center gap-2">
            <GlobeIcon
              className={`h-5 w-5 transition-colors ${
                hoveredCard === "translate" ? "text-yt-red" : "text-text-secondary"
              }`}
            />
            <span className="text-base font-bold">Translate</span>
            <span className="rounded-full bg-yt-red/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-yt-red">
              Premium
            </span>
          </div>
          <p className="text-sm leading-relaxed text-text-secondary">
            Translate the full transcript into another language.
          </p>

          <div className="flex w-full items-center gap-2 pt-1">
            <select
              value={language}
              onChange={(e) => onLanguageChange(e.target.value)}
              className="h-9 flex-1 rounded-lg border border-border bg-background px-3 text-sm outline-none transition-colors focus:border-yt-red"
            >
              {languages.map((lang) => (
                <option key={lang} value={lang}>
                  {lang}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={loading}
              onClick={() => handlePremiumClick(onTranslate)}
              className="h-9 rounded-lg bg-yt-red px-4 text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "..." : "Translate"}
            </button>
          </div>
        </div>
      </div>

      {showGate && (
        <PremiumGateModal loggedIn={!!user} onCancel={() => setShowGate(false)} />
      )}
    </div>
  );
}
