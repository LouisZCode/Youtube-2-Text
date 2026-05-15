"use client";

import { useState } from "react";
import { FeedbackName } from "@/lib/types";
import { submitFeedback } from "@/lib/api";

interface FeedbackCardProps {
  traceId: string;
  name: FeedbackName;
  surfaceLabel: "transcript" | "summary" | "translation";
  onClose: () => void;
}

export default function FeedbackCard({ traceId, name, surfaceLabel, onClose }: FeedbackCardProps) {
  const [selected, setSelected] = useState<"up" | "down" | null>(null);
  const [comment, setComment] = useState("");

  function handleThumbsUp() {
    submitFeedback({ trace_id: traceId, name, value: 1 });
    onClose();
  }

  function handleThumbsDown() {
    setSelected("down");
  }

  function handleSend() {
    submitFeedback({
      trace_id: traceId,
      name,
      value: 0,
      comment: comment.trim() || undefined,
    });
    onClose();
  }

  return (
    <div className="animate-slide-up flex w-full max-w-[800px] flex-col rounded-xl border border-border bg-card">
      <div className="flex items-center justify-between gap-3 p-3">
        <p className="text-sm font-bold">How was this {surfaceLabel}?</p>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleThumbsUp}
            aria-label="Thumbs up"
            className={`flex h-9 w-12 items-center justify-center rounded-lg border bg-background text-xl transition-colors hover:border-yt-red ${
              selected === "up" ? "border-yt-red" : "border-border"
            }`}
          >
            👍
          </button>
          <button
            type="button"
            onClick={handleThumbsDown}
            aria-label="Thumbs down"
            className={`flex h-9 w-12 items-center justify-center rounded-lg border bg-background text-xl transition-colors hover:border-yt-red ${
              selected === "down" ? "border-yt-red" : "border-border"
            }`}
          >
            👎
          </button>
          <button
            type="button"
            onClick={onClose}
            aria-label="Dismiss feedback"
            className="ml-1 flex h-9 w-9 items-center justify-center rounded-md text-text-secondary transition-colors hover:bg-border/50"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {selected === "down" && (
        <div className="flex flex-col gap-3 border-t border-border p-3">
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            maxLength={500}
            rows={3}
            autoFocus
            placeholder="What could be better? (optional)"
            className="w-full resize-none rounded-lg border border-border bg-background p-3 text-sm outline-none transition-colors focus:border-yt-red"
          />
          <button
            type="button"
            onClick={handleSend}
            className="h-9 self-end rounded-lg bg-yt-red px-5 text-sm font-bold text-white transition-opacity hover:opacity-90"
          >
            Send
          </button>
        </div>
      )}
    </div>
  );
}
