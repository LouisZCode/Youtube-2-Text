"use client";

import { useState, useEffect, useRef } from "react";
import { TranscriptResult, Mode } from "@/lib/types";
import { fetchTranscript, fetchTranscriptPremium, fetchSummary, fetchTranslationStream, downloadPdf, fetchLanguages } from "@/lib/api";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import OutputCard from "@/components/OutputCard";
import PremiumUpsell from "@/components/PremiumUpsell";
import ErrorModal from "@/components/ErrorModal";
import Footer from "@/components/Footer";

const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;

const languages = ["Spanish", "Portuguese", "German", "French"];

export default function Home() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("transcription");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [language, setLanguage] = useState("Spanish");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [isLimitError, setIsLimitError] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [detectedLangName, setDetectedLangName] = useState<string | null>(null);
  const [detectingLang, setDetectingLang] = useState(false);
  const [noCaptions, setNoCaptions] = useState(false);
  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-detect caption language when a valid YouTube URL is entered
  useEffect(() => {
    if (detectTimer.current) clearTimeout(detectTimer.current);
    setDetectedLang(null);
    setDetectedLangName(null);
    setNoCaptions(false);

    if (!YT_URL_RE.test(url.trim())) return;

    setDetectingLang(true);
    detectTimer.current = setTimeout(async () => {
      const data = await fetchLanguages(url.trim());
      if (data.success && data.default) {
        setDetectedLang(data.default);
        const match = data.languages.find((l) => l.code === data.default);
        setDetectedLangName(match?.name || data.default);
      } else {
        setNoCaptions(true);
      }
      setDetectingLang(false);
    }, 600);

    return () => { if (detectTimer.current) clearTimeout(detectTimer.current); };
  }, [url]);

  function handleApiError(err: unknown) {
    const msg = err instanceof Error ? err.message : "Something went wrong";
    if (msg.startsWith("__LIMIT__")) {
      setError(msg.slice(9));
      setIsLimitError(true);
      setShowSignIn(true);
    } else if (msg.startsWith("__AUTH__")) {
      setError(msg.slice(7));
      setShowSignIn(true);
    } else if (msg.startsWith("__PREMIUM__")) {
      setError(msg.slice(11));
      setShowSignIn(false);
    } else {
      setError(msg);
    }
  }

  async function handleSubmit() {
    if (!url.trim()) return;

    if (!YT_URL_RE.test(url.trim())) {
      setError("Please paste a valid YouTube link (e.g. youtube.com/watch?v=...)");
      return;
    }

    setLoading(true);
    setError(null);
    setIsLimitError(false);
    setShowSignIn(false);
    setResult(null);
    setSummary(null);
    setTranslation(null);
    setElapsed(null);

    const start = performance.now();

    try {
      const fetcher = mode === "pro" ? fetchTranscriptPremium : fetchTranscript;
      const data = await fetcher(url, detectedLang || "en");

      if (!data.success) {
        setError(data.error);
        return;
      }

      setElapsed(Math.round((performance.now() - start) / 1000 * 10) / 10);
      setResult(data);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSummary() {
    if (!result) return;
    setMode("summary");
    setLoading(true);
    setSummary(null);
    setError(null);
    setShowSignIn(false);
    try {
      const transcription = result.segments.map((s) => s.text).join(" ");
      const summaryData = await fetchSummary(transcription);
      setSummary(summaryData.summary);
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleTranslate() {
    if (!result) return;
    setMode("translate");
    setLoading(true);
    setTranslation("");
    setError(null);
    setShowSignIn(false);
    try {
      await fetchTranslationStream(result.segments, language, (chunk) => {
        setTranslation((prev) => (prev || "") + chunk + "\n\n");
      });
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col">
      <Header />

      <main className="mx-auto flex w-full max-w-[800px] flex-1 flex-col items-center gap-10 px-4 pt-28 pb-8">
        <Hero
          url={url}
          loading={loading}
          mode={mode}
          detectedLang={detectedLang}
          detectedLangName={detectedLangName}
          detectingLang={detectingLang}
          noCaptions={noCaptions}
          onUrlChange={setUrl}
          onModeChange={setMode}
          onSubmit={handleSubmit}
        />

        {error && (
          <ErrorModal message={error} onClose={() => setError(null)} showSignIn={showSignIn} />
        )}

        {result && (
          <>
            <OutputCard
              result={result}
              mode={mode}
              loading={loading}
              summary={summary}
              translation={translation}
              elapsedSeconds={elapsed}
            />

            {(mode === "transcription" || mode === "pro") && !loading && (
              <PremiumUpsell
                language={language}
                languages={languages}
                onLanguageChange={setLanguage}
                onDownloadPdf={() => result && downloadPdf(result.segments)}
                onSummary={handleSummary}
                onTranslate={handleTranslate}
                loading={loading}
              />
            )}
          </>
        )}
      </main>

      <Footer />
    </div>
  );
}
