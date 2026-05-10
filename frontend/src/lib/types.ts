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
}

export type ErrorCode = "transient" | "no_captions" | "unavailable" | "bad_input" | "unknown";

export interface TranscriptError {
  success: false;
  error: string;
  error_code?: ErrorCode;
}

export type TranscriptResponse = TranscriptResult | TranscriptError;

export interface SummaryResponse {
  summary: string;
}

export interface TranslateResponse {
  translation: string;
}

export interface TranslateChunkEvent {
  translation?: string;
  done?: boolean;
  error?: string;
}

export type Mode = "transcription" | "pro" | "summary" | "translate";
