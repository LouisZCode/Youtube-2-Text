"use client";

import { useState } from "react";
import { TranscriptResult, Mode } from "@/lib/types";
import { fetchTranscript, fetchTranscriptPremium, fetchSummary, fetchTranslationStream } from "@/lib/api";
import Header from "@/components/Header";
import Hero from "@/components/Hero";
import OutputCard from "@/components/OutputCard";
import Footer from "@/components/Footer";

export default function Home() {
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("transcription");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [language, setLanguage] = useState("Spanish");

  async function handleSubmit() {
    if (!url.trim()) return;

    setLoading(true);
    setError(null);
    setResult(null);
    setSummary(null);
    setTranslation(null);

    try {
      const fetcher = mode === "pro" ? fetchTranscriptPremium : fetchTranscript;
      const data = await fetcher(url);

      if (!data.success) {
        setError(data.error);
        return;
      }

      setResult(data);

      // Summary mode: chain a summary call after getting the transcript
      if (mode === "summary") {
        const transcription = data.segments.map((s) => s.text).join(" ");
        const summaryData = await fetchSummary(transcription);
        setSummary(summaryData.summary);
      }

      // Translate mode: stream translation chunks progressively
      if (mode === "translate") {
        setTranslation("");
        await fetchTranslationStream(data.segments, language, (chunk) => {
          setTranslation((prev) => (prev || "") + chunk + "\n\n");
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
          language={language}
          onUrlChange={setUrl}
          onModeChange={setMode}
          onLanguageChange={setLanguage}
          onSubmit={handleSubmit}
        />

        {error && (
          <div className="w-full max-w-[560px] rounded-lg border border-red-300 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400">
            {error}
          </div>
        )}

        {result && (
          <OutputCard
            result={result}
            mode={mode}
            loading={loading}
            summary={summary}
            translation={translation}
          />
        )}
      </main>

      <Footer />
    </div>
  );
}
