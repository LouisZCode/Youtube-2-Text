export interface Segment {
  timestamp: string;
  text: string;
}

export interface TranscriptResult {
  success: true;
  video_id: string;
  source: "captions" | "audio_transcription";
  language: string;
  segments: Segment[];
  word_count: number;
  trace_id?: string;
}

export type ErrorCode = "transient" | "no_captions" | "unavailable" | "bad_input" | "too_long" | "unknown";

export interface TranscriptError {
  success: false;
  error: string;
  error_code?: ErrorCode;
}

export type TranscriptResponse = TranscriptResult | TranscriptError;

export interface SummaryResponse {
  summary: string;
  trace_id?: string;
}

export interface TranslateResponse {
  translation: string;
}

export interface TranslateChunkEvent {
  translation?: string;
  done?: boolean;
  error?: string;
  trace_id?: string;
}

export interface PremiumStatus {
  stage: "checking" | "downloading" | "transcribing";
  percent: number | null;
}

export interface PremiumStreamEvent {
  status?: PremiumStatus;
  done?: boolean;
  success?: boolean;
  error?: string;
  error_code?: ErrorCode;
  video_id?: string;
  source?: "captions" | "audio_transcription";
  language?: string;
  segments?: Segment[];
  word_count?: number;
  trace_id?: string;
}

export type FeedbackName = "transcript-thumbs" | "summary-thumbs" | "translation-thumbs";

export type Mode = "transcription" | "pro" | "summary" | "translate";
