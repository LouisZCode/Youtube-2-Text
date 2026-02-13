"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { Mode } from "@/lib/types";
import PremiumGateModal from "./PremiumGateModal";

interface HeroProps {
  url: string;
  loading: boolean;
  mode: Mode;
  onUrlChange: (url: string) => void;
  onModeChange: (mode: Mode) => void;
  onSubmit: () => void;
}

const modes: { value: Mode; label: string }[] = [
  { value: "transcription", label: "Freemium" },
  { value: "pro", label: "Premium" },
];

export default function Hero({ url, loading, mode, onUrlChange, onModeChange, onSubmit }: HeroProps) {
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
        {/* URL input */}
        <div className="flex w-full flex-col gap-0 sm:flex-row sm:gap-0">
          <input
            type="text"
            value={url}
            onChange={(e) => onUrlChange(e.target.value)}
            placeholder="https://youtube.com/watch?v=..."
            className="h-12 w-full rounded-full border border-border bg-card px-5 text-sm outline-none transition-colors placeholder:text-text-secondary focus:border-yt-red"
          />
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
