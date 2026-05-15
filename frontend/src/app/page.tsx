"use client";

import { useState, useEffect, useRef } from "react";
import { TranscriptResult, Mode, ErrorCode, FeedbackName } from "@/lib/types";
import { fetchTranscript, fetchTranscriptPremium, fetchSummary, fetchTranslationStream, downloadPdf, fetchLanguages } from "@/lib/api";
import dynamic from "next/dynamic";
import Header from "@/components/Header";
import Hero from "@/components/Hero";

const OutputCard = dynamic(() => import("@/components/OutputCard"));
const PremiumUpsell = dynamic(() => import("@/components/PremiumUpsell"));
const ActionBar = dynamic(() => import("@/components/ActionBar"));
const ErrorModal = dynamic(() => import("@/components/ErrorModal"));
const PremiumGateModal = dynamic(() => import("@/components/PremiumGateModal"));
const FeedbackCard = dynamic(() => import("@/components/FeedbackCard"));
const Footer = dynamic(() => import("@/components/Footer"));

const FEEDBACK_SAMPLE_RATE = 0.10;
import { useAuth } from "@/context/AuthContext";

const YT_URL_RE = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/shorts\/)/;

const ALL_LANGUAGES: Array<{ code: string; name: string }> = [
  { code: "en", name: "English" },
  { code: "es", name: "Spanish" },
  { code: "pt", name: "Portuguese" },
  { code: "de", name: "German" },
  { code: "fr", name: "French" },
];

export default function Home() {
  const { user } = useAuth();
  const [url, setUrl] = useState("");
  const [mode, setMode] = useState<Mode>("transcription");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [translation, setTranslation] = useState<string | null>(null);
  const [language, setLanguage] = useState("es");
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [isLimitError, setIsLimitError] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [detectedLang, setDetectedLang] = useState<string | null>(null);
  const [detectedLangName, setDetectedLangName] = useState<string | null>(null);
  const [detectingLang, setDetectingLang] = useState(false);
  const [langDetectError, setLangDetectError] = useState<{ code: ErrorCode; message: string } | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [summaryLang, setSummaryLang] = useState<string | null>(null);
  const [feedbackOpen, setFeedbackOpen] = useState<{
    traceId: string;
    name: FeedbackName;
    surfaceLabel: "transcript" | "summary" | "translation";
  } | null>(null);
  const detectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transcriptModeRef = useRef<Mode>("transcription");

  function maybeOpenFeedback(
    traceId: string | undefined,
    name: FeedbackName,
    surfaceLabel: "transcript" | "summary" | "translation",
  ) {
    if (!traceId) return;
    if (Math.random() < FEEDBACK_SAMPLE_RATE) {
      setFeedbackOpen({ traceId, name, surfaceLabel });
    }
  }

  function feedbackMatchesMode(fbName: FeedbackName, m: Mode): boolean {
    if (fbName === "transcript-thumbs") return m === "transcription" || m === "pro";
    if (fbName === "summary-thumbs") return m === "summary";
    return m === "translate";
  }

  // Auto-detect caption language when a valid YouTube URL is entered
  useEffect(() => {
    if (detectTimer.current) clearTimeout(detectTimer.current);
    setDetectedLang(null);
    setDetectedLangName(null);
    setLangDetectError(null);

    if (!YT_URL_RE.test(url.trim())) {
      setSessionId(null);
      return;
    }

    setSessionId(crypto.randomUUID());
    setDetectingLang(true);
    detectTimer.current = setTimeout(async () => {
      const data = await fetchLanguages(url.trim());
      if (data.success && data.default) {
        setDetectedLang(data.default);
        const match = data.languages.find((l) => l.code === data.default);
        setDetectedLangName(match?.name || data.default);
      } else {
        setLangDetectError({ code: data.error_code ?? "unknown", message: data.error ?? "" });
      }
      setDetectingLang(false);
    }, 600);

    return () => { if (detectTimer.current) clearTimeout(detectTimer.current); };
  }, [url]);

  const sourceCode = detectedLang ? detectedLang.split("-")[0] : null;
  // currentCode = the language actually rendered on screen right now.
  // summary mode: whatever lang the summary was generated in (chain rule may differ from source)
  // translate mode: the translation target
  // transcription/pro: source
  const currentCode = mode === "translate"
    ? language
    : mode === "summary" && summaryLang
      ? summaryLang
      : sourceCode;
  const excluded = new Set<string>();
  if (sourceCode) excluded.add(sourceCode);
  if (currentCode) excluded.add(currentCode);
  const availableLanguages = ALL_LANGUAGES.filter((l) => !excluded.has(l.code));

  // Auto-shift the dropdown when its selected value is no longer in the filtered list.
  // Guarded out of translate mode (where language === currentCode by design).
  if (mode !== "translate" && currentCode && language === currentCode) {
    setLanguage(availableLanguages[0]?.code ?? "en");
  }

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
    setFeedbackOpen(null);
    setMode(transcriptModeRef.current);

    const start = performance.now();

    try {
      const data = mode === "pro"
        ? await fetchTranscriptPremium(url, detectedLang || "en", sessionId)
        : await fetchTranscript(url, detectedLang || "en");

      if (!data.success) {
        setError(data.error);
        return;
      }

      setElapsed(Math.round((performance.now() - start) / 1000 * 10) / 10);
      setResult(data);
      maybeOpenFeedback(data.trace_id, "transcript-thumbs", "transcript");
    } catch (err) {
      handleApiError(err);
    } finally {
      setLoading(false);
    }
  }

  async function handleSummary() {
    if (!result) return;
    // Chain rule: if viewing a translation, summarize the translated text in target lang.
    // Otherwise summarize the original transcript in source lang.
    const useTranslationAsSource = mode === "translate" && !!translation;
    const sourceText = useTranslationAsSource
      ? translation!
      : result.segments.map((s) => s.text).join(" ");
    const sourceLang = useTranslationAsSource ? language : (detectedLang || "en");

    setMode("summary");
    setSummaryLang(sourceLang);
    setLoading(true);
    setSummary(null);
    setError(null);
    setShowSignIn(false);
    setFeedbackOpen(null);
    try {
      const summaryData = await fetchSummary(sourceText, sourceLang, sessionId);
      setSummary(summaryData.summary);
      maybeOpenFeedback(summaryData.trace_id, "summary-thumbs", "summary");
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
    setFeedbackOpen(null);
    try {
      const { trace_id } = await fetchTranslationStream(result.segments, language, (chunk) => {
        setTranslation((prev) => (prev || "") + chunk + "\n\n");
      }, sessionId);
      maybeOpenFeedback(trace_id, "translation-thumbs", "translation");
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
          langDetectError={langDetectError}
          onUrlChange={setUrl}
          onModeChange={(m) => {
            if (m === "transcription" || m === "pro") {
              transcriptModeRef.current = m;
            }
            setMode(m);
          }}
          onSubmit={handleSubmit}
        />

        {error && isLimitError && user ? (
          <PremiumGateModal
            loggedIn
            reason="You used your 20 Free Tier transcriptions this month."
            onCancel={() => setError(null)}
          />
        ) : error ? (
          <ErrorModal message={error} onClose={() => setError(null)} showSignIn={showSignIn} />
        ) : null}

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

            {feedbackOpen && !loading && feedbackMatchesMode(feedbackOpen.name, mode) && (
              <FeedbackCard
                traceId={feedbackOpen.traceId}
                name={feedbackOpen.name}
                surfaceLabel={feedbackOpen.surfaceLabel}
                onClose={() => setFeedbackOpen(null)}
              />
            )}

            {(mode === "transcription" || mode === "pro") && !loading && (
              <PremiumUpsell
                language={language}
                languages={availableLanguages}
                onLanguageChange={setLanguage}
                onDownloadPdf={() => result && downloadPdf({ kind: "transcript", segments: result.segments, videoId: result.video_id })}
                onSummary={handleSummary}
                onTranslate={handleTranslate}
                loading={loading}
              />
            )}

            {(mode === "summary" || mode === "translate") && !loading && (
              <ActionBar
                mode={mode}
                language={language}
                languages={availableLanguages}
                onLanguageChange={setLanguage}
                onSummary={handleSummary}
                onTranslate={handleTranslate}
                onDownloadPdf={() => {
                  if (mode === "summary" && summary) {
                    downloadPdf({ kind: "summary", text: summary, videoId: result?.video_id });
                  } else if (mode === "translate" && translation) {
                    downloadPdf({ kind: "translation", text: translation, language, videoId: result?.video_id });
                  }
                }}
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
