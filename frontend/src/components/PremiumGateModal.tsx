"use client";

import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import { createCheckout } from "@/lib/api";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

interface PremiumGateModalProps {
  loggedIn: boolean;
  onCancel: () => void;
  reason?: string;
}

export default function PremiumGateModal({ loggedIn, onCancel, reason }: PremiumGateModalProps) {
  const { user } = useAuth();
  const [loading, setLoading] = useState<"monthly" | "yearly" | "lifetime" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function handleCheckout(plan: "monthly" | "yearly" | "lifetime") {
    setLoading(plan);
    setError(null);
    try {
      const url = await createCheckout(plan);
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
      setLoading(null);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onCancel}
    >
      <div
        className="animate-slide-up mx-4 w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yt-red/10">
            <svg className="h-6 w-6 text-yt-red" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>
          <p className="text-base font-bold">Unlock Premium</p>
          {reason && (
            <p className="text-sm font-medium text-yt-red">{reason}</p>
          )}

          <ul className="w-full space-y-2 text-left text-sm text-text-secondary">
            <li className="flex items-center gap-2">
              <span className="text-yt-red">&#10003;</span>
              98%+ accurate transcriptions, don&apos;t lose details
            </li>
            <li className="flex items-center gap-2">
              <span className="text-yt-red">&#10003;</span>
              Smart video summaries
            </li>
            <li className="flex items-center gap-2">
              <span className="text-yt-red">&#10003;</span>
              Translate transcripts to multiple languages
            </li>
            <li className="flex items-center gap-2">
              <span className="text-yt-red">&#10003;</span>
              Access to free updates for life
            </li>
          </ul>

          {!loggedIn ? (
            <a
              href={`${API_URL}/auth/google/login`}
              className="flex h-10 w-full items-center justify-center gap-2 rounded-full border border-border bg-white text-sm font-bold text-gray-800 transition-opacity hover:opacity-90"
            >
              <svg className="h-5 w-5" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              Sign in with Google
            </a>
          ) : (
            <div className="flex w-full gap-3">
              {/* Monthly plan */}
              <div className="flex flex-1 flex-col items-center gap-2 rounded-lg border border-border p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">Monthly</p>
                <p className="text-2xl font-bold">&euro;5<span className="text-sm font-normal text-text-secondary">/mo</span></p>
                <button
                  onClick={() => handleCheckout("monthly")}
                  disabled={loading !== null}
                  className="h-9 w-full rounded-full bg-yt-red text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {loading === "monthly" ? "Redirecting..." : "Subscribe"}
                </button>
              </div>
              {/* Yearly plan */}
              <div className="flex flex-1 flex-col items-center gap-2 rounded-lg border border-border p-3">
                <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">Yearly</p>
                <p className="text-2xl font-bold">&euro;49<span className="text-sm font-normal text-text-secondary">/yr</span></p>
                <button
                  onClick={() => handleCheckout("yearly")}
                  disabled={loading !== null}
                  className="h-9 w-full rounded-full bg-yt-red text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {loading === "yearly" ? "Redirecting..." : "Subscribe"}
                </button>
              </div>
              {/* Lifetime plan */}
              <div className="relative flex flex-1 flex-col items-center gap-2 rounded-lg border-2 border-yt-red p-3">
                <span className="absolute -top-2.5 rounded-full bg-yt-red px-2 py-0.5 text-[10px] font-bold uppercase text-white">
                  Best value
                </span>
                <p className="text-xs font-bold uppercase tracking-wide text-text-secondary">Lifetime</p>
                <p className="text-2xl font-bold">&euro;79<span className="text-sm font-normal text-text-secondary"> once</span></p>
                <button
                  onClick={() => handleCheckout("lifetime")}
                  disabled={loading !== null}
                  className="h-9 w-full rounded-full bg-yt-red text-sm font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {loading === "lifetime" ? "Redirecting..." : "Buy once"}
                </button>
              </div>
            </div>
          )}

          {error && (
            <p className="text-xs text-yt-red">{error}</p>
          )}

          <button
            onClick={onCancel}
            className="h-10 w-full rounded-full border border-border bg-card text-sm font-bold text-text-secondary transition-opacity hover:opacity-90"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
