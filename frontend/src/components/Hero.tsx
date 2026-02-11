"use client";

import { Mode } from "@/lib/types";

interface HeroProps {
  url: string;
  loading: boolean;
  mode: Mode;
  onUrlChange: (url: string) => void;
  onModeChange: (mode: Mode) => void;
  onSubmit: () => void;
}

const modes: { value: Mode; label: string }[] = [
  { value: "transcription", label: "Transcription" },
  { value: "pro", label: "Pro Transcription" },
  { value: "summary", label: "Summary" },
];

export default function Hero({ url, loading, mode, onUrlChange, onModeChange, onSubmit }: HeroProps) {
  const buttonLabel = mode === "summary" ? "GET SUMMARY" : "GET TRANSCRIPTION";

  return (
    <section className="flex flex-col items-center gap-4 text-center">
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
        Paste a YouTube link and get a formatted transcript with timestamps — instantly.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSubmit();
        }}
        className="mt-6 flex w-full max-w-[640px] flex-col gap-5"
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
        <div className="flex w-full rounded-full border border-border overflow-hidden">
          {modes.map((m) => (
            <button
              key={m.value}
              type="button"
              onClick={() => onModeChange(m.value)}
              className={`flex-1 py-2.5 text-sm font-bold transition-colors ${
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
          className="h-12 w-full rounded-full bg-yt-red text-sm font-bold tracking-wide text-white transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {loading ? "PROCESSING..." : buttonLabel}
        </button>
      </form>
    </section>
  );
}
