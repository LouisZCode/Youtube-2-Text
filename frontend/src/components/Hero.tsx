"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Mode } from "@/lib/types";
import PremiumGateModal from "./PremiumGateModal";

interface HeroProps {
  url: string;
  loading: boolean;
  mode: Mode;
  detectedLang: string | null;
  detectedLangName: string | null;
  detectingLang: boolean;
  onUrlChange: (url: string) => void;
  onModeChange: (mode: Mode) => void;
  onSubmit: () => void;
}

const langToFlag: Record<string, string> = {
  en: "\u{1F1FA}\u{1F1F8}", es: "\u{1F1EA}\u{1F1F8}", fr: "\u{1F1EB}\u{1F1F7}",
  de: "\u{1F1E9}\u{1F1EA}", pt: "\u{1F1E7}\u{1F1F7}", it: "\u{1F1EE}\u{1F1F9}",
  ja: "\u{1F1EF}\u{1F1F5}", ko: "\u{1F1F0}\u{1F1F7}", zh: "\u{1F1E8}\u{1F1F3}",
  "zh-Hans": "\u{1F1E8}\u{1F1F3}", "zh-Hant": "\u{1F1F9}\u{1F1FC}",
  ru: "\u{1F1F7}\u{1F1FA}", ar: "\u{1F1F8}\u{1F1E6}", hi: "\u{1F1EE}\u{1F1F3}",
  nl: "\u{1F1F3}\u{1F1F1}", pl: "\u{1F1F5}\u{1F1F1}", tr: "\u{1F1F9}\u{1F1F7}",
  sv: "\u{1F1F8}\u{1F1EA}", vi: "\u{1F1FB}\u{1F1F3}", th: "\u{1F1F9}\u{1F1ED}",
  id: "\u{1F1EE}\u{1F1E9}", uk: "\u{1F1FA}\u{1F1E6}", cs: "\u{1F1E8}\u{1F1FF}",
  ro: "\u{1F1F7}\u{1F1F4}", el: "\u{1F1EC}\u{1F1F7}", hu: "\u{1F1ED}\u{1F1FA}",
  da: "\u{1F1E9}\u{1F1F0}", fi: "\u{1F1EB}\u{1F1EE}", no: "\u{1F1F3}\u{1F1F4}",
  he: "\u{1F1EE}\u{1F1F1}", ms: "\u{1F1F2}\u{1F1FE}", fil: "\u{1F1F5}\u{1F1ED}",
};

const modes: { value: Mode; label: string }[] = [
  { value: "transcription", label: "Freemium" },
  { value: "pro", label: "Premium" },
];

export default function Hero({ url, loading, mode, detectedLang, detectedLangName, detectingLang, onUrlChange, onModeChange, onSubmit }: HeroProps) {
  const { user } = useAuth();
  const [showGate, setShowGate] = useState(false);
  const buttonLabel = "GET TRANSCRIPTION";

  const isPremium = user?.tier === "premium";

  function handleModeClick(m: Mode) {
    if (m === "pro" && !isPremium) {
      onModeChange("pro");
      setTimeout(() => setShowGate(true), 500);
      return;
    }
    onModeChange(m);
  }

  function handleGateCancel() {
    setShowGate(false);
    onModeChange("transcription");
  }

  return (
    <section className="flex flex-col items-center gap-5 text-center">
      <div className="flex items-center gap-3">
        <div style={{ width: "150px", height: "150px", flexShrink: 0, overflow: "hidden" }}>
          <div style={{ width: "500px", height: "500px", transform: "scale(0.3) translateY(-180px)", transformOrigin: "top left" }}>
            {/* @ts-expect-error — hana-viewer is a web component */}
            <hana-viewer
              url="https://prod.spline.design/JUDRPnotN4nfb0Tl-515/scene.hanacode"
              style={{ width: "100%", height: "100%" }}
            />
          </div>
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Video to Text<span className="text-yt-red">.</span>
        </h1>
      </div>
      <p className="max-w-md text-text-secondary">
        Turn any YouTube video into readable text in seconds.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="mt-6 flex w-full max-w-[640px] flex-col gap-7"
      >
        {/* URL input with language flag */}
        <div className="relative flex w-full items-center">
          <input
            type="text"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="h-12 w-full rounded-full border border-border bg-card px-5 pr-14 text-sm outline-none transition-colors placeholder:text-text-secondary focus:border-yt-red"
          />
          <div
            className={`absolute right-3 flex h-8 w-8 items-center justify-center overflow-hidden rounded-full border-2 transition-all duration-500 ${
              detectingLang
                ? "animate-pulse border-text-secondary"
                : detectedLang
                  ? "border-transparent bg-card text-[2rem]"
                  : "border-border"
            }`}
            title={detectedLangName || undefined}
          >
            {detectedLang ? (langToFlag[detectedLang] || langToFlag[detectedLang.split("-")[0]] || detectedLang.toUpperCase()) : ""}
          </div>
        </div>

        {/* Mode toggle */}
        <div className="relative flex w-full rounded-full border border-border overflow-hidden">
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => handleModeClick(m.value)}
              className={`flex-1 h-12 text-sm font-bold transition-colors duration-500 ${
                mode === m.value
                  ? "bg-yt-red text-white"
                  : "bg-card text-text-secondary hover:text-foreground"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Action button */}
        <button
          type="submit"
          disabled={loading || !url.trim()}
          className="h-12 w-full rounded-full bg-yt-red text-base font-bold tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              PROCESSING...
            </span>
          ) : buttonLabel}
        </button>
      </form>

      {showGate && (
        <PremiumGateModal loggedIn={!!user} onCancel={handleGateCancel} />
      )}
    </section>
  );
}
