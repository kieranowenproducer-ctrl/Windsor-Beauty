'use client';

// The premium microphone, ported from the Social Engine's SlideshowComposer —
// the mic Kieran asked every surface to match. Two capture paths run at once:
//
//   - The browser's SpeechRecognition gives LIVE interim text while you speak
//     (the host shows it in its own input), so the control answers "is it
//     hearing me" instantly.
//   - MediaRecorder captures real audio for the accurate server transcription,
//     which replaces the rough live text when it lands.
//
// The level meter is REAL — an AnalyserNode reading the microphone, not a CSS
// pulse. Three fake pulsing bars look identical whether the mic is working,
// muted, or hearing nothing at all; the one question this control exists to
// answer would be answered wrongly with confidence. (Same reasoning, and same
// square-root loudness curve, as the Social Engine's meter.)
//
// Words are never lost: if the server transcription fails but live text was
// heard, the live text is kept and the host is told it is the rough version.
// Escape while listening throws the recording away.

import { useCallback, useEffect, useRef, useState } from 'react';

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }>>; resultIndex: number }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}

function speechRecognition(): SpeechRecognitionLike | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as Record<string, unknown>;
  const Ctor = (w.SpeechRecognition || w.webkitSpeechRecognition) as (new () => SpeechRecognitionLike) | undefined;
  if (!Ctor) return null;
  const r = new Ctor();
  r.lang = 'en-GB';
  // Live text the whole time, and no auto-stop on a pause: the person decides
  // when they are done, not the browser's silence detector.
  r.interimResults = true;
  r.continuous = true;
  return r;
}

const METER_BARS = 14;
const FLAT = Array.from({ length: METER_BARS }, () => 0);
const MAX_SECONDS = 120; // a forgotten mic cannot record forever

export type VoicePhase = 'idle' | 'listening' | 'transcribing';

export default function VoiceMic({
  endpoint,
  disabled,
  onText,
  onInterim,
  onPhase,
  onNotice,
}: {
  /** POST target that accepts FormData {audio, durationSeconds} and returns {ok, text}. */
  endpoint: string;
  disabled?: boolean;
  /** Final text (accurate server transcription, or the kept rough live text). */
  onText: (text: string) => void;
  /** Live interim text while listening; null when listening ends. */
  onInterim?: (text: string | null) => void;
  onPhase?: (phase: VoicePhase) => void;
  /** Human messages (errors, "thrown away") for the host's notice area. */
  onNotice?: (message: string | null) => void;
}) {
  const [phase, setPhaseState] = useState<VoicePhase>('idle');
  const [levels, setLevels] = useState<number[]>(FLAT);
  const [seconds, setSeconds] = useState(0);
  // Set in an effect, not during render, to avoid a hydration mismatch.
  const [canRecord, setCanRecord] = useState(false);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const meterFrameRef = useRef<number>(0);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const interimRef = useRef('');
  const tickerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const startedAtRef = useRef(0);
  const cancelledRef = useRef(false);
  const phaseRef = useRef<VoicePhase>('idle');

  const setPhase = useCallback(
    (p: VoicePhase) => {
      phaseRef.current = p;
      setPhaseState(p);
      onPhase?.(p);
    },
    [onPhase],
  );

  useEffect(() => {
    setCanRecord(
      typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== 'undefined',
    );
  }, []);

  const stopMeter = useCallback(() => {
    cancelAnimationFrame(meterFrameRef.current);
    // An AudioContext left running holds the microphone open.
    audioCtxRef.current?.close().catch(() => {});
    audioCtxRef.current = null;
    setLevels(FLAT);
  }, []);

  const teardown = useCallback(() => {
    recognitionRef.current?.stop();
    recognitionRef.current = null;
    stopMeter();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (tickerRef.current) clearInterval(tickerRef.current);
    tickerRef.current = null;
    onInterim?.(null);
  }, [onInterim, stopMeter]);

  useEffect(() => () => teardown(), [teardown]);

  const startMeter = useCallback((stream: MediaStream) => {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    audioCtxRef.current = ctx;
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0.6;
    ctx.createMediaStreamSource(stream).connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let peak = 0;
      for (let i = 0; i < data.length; i++) peak = Math.max(peak, Math.abs(data[i] - 128));
      // Square-root curve: speech spends most of its time quiet, and a linear
      // meter therefore barely leaves the floor.
      const level = Math.min(1, Math.sqrt(peak / 128) * 1.35);
      setLevels((prev) => [...prev.slice(1), level]);
      meterFrameRef.current = requestAnimationFrame(tick);
    };
    meterFrameRef.current = requestAnimationFrame(tick);
  }, []);

  const finish = useCallback(
    async (blob: Blob, mime: string, heardSeconds: number) => {
      const roughText = interimRef.current.trim();
      // Slip guard: a tap-tap under a second is an accident, not a message.
      if (heardSeconds < 1 || blob.size < 2000) {
        setPhase('idle');
        return;
      }
      setPhase('transcribing');
      try {
        const form = new FormData();
        form.append('audio', blob, mime.includes('mp4') ? 'note.mp4' : 'note.webm');
        form.append('durationSeconds', String(heardSeconds));
        const res = await fetch(endpoint, { method: 'POST', body: form });
        const json = await res.json().catch(() => null);
        if (!res.ok || !json?.ok || !json.text) throw new Error(json?.error || 'transcription failed');
        onText(String(json.text));
        onNotice?.(null);
      } catch {
        if (roughText) {
          // Keep the words. The accurate pass failed; the rough live text did not.
          onText(roughText);
          onNotice?.('The clearer transcription failed, so what you see is the rough live version. Read it over and edit anything odd.');
        } else {
          onNotice?.('I could not write that down. Try again, or type it instead.');
        }
      } finally {
        setPhase('idle');
      }
    },
    [endpoint, onNotice, onText, setPhase],
  );

  const stopListening = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  const cancelListening = useCallback(() => {
    cancelledRef.current = true;
    recorderRef.current?.stop();
    onNotice?.('Recording thrown away.');
  }, [onNotice]);

  // Escape discards without transcribing, same as the Social Engine.
  useEffect(() => {
    if (phase !== 'listening') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancelListening();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [phase, cancelListening]);

  const startListening = useCallback(async () => {
    onNotice?.(null);
    interimRef.current = '';
    cancelledRef.current = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : 'audio/mp4';
      const rec = new MediaRecorder(stream, { mimeType: mime });
      recorderRef.current = rec;
      chunksRef.current = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunksRef.current.push(e.data);
      };
      rec.onstop = () => {
        const heard = Math.round((Date.now() - startedAtRef.current) / 1000);
        const blob = new Blob(chunksRef.current, { type: mime });
        teardown();
        if (cancelledRef.current) {
          setPhase('idle');
          return;
        }
        void finish(blob, mime, heard);
      };
      // 1s timeslice: a long note is not one enormous blob held in memory, and
      // a crash mid-recording still leaves usable chunks.
      rec.start(1000);
      startedAtRef.current = Date.now();
      setSeconds(0);
      tickerRef.current = setInterval(() => {
        const s = Math.round((Date.now() - startedAtRef.current) / 1000);
        setSeconds(s);
        if (s >= MAX_SECONDS) stopListening();
      }, 1000);
      startMeter(stream);

      // The live-text half. Optional: without it the mic still works, there is
      // just no interim text and the failure fallback has nothing to keep.
      const sr = speechRecognition();
      if (sr) {
        recognitionRef.current = sr;
        sr.onresult = (e) => {
          let text = '';
          for (let i = 0; i < e.results.length; i++) text += e.results[i][0]?.transcript ?? '';
          interimRef.current = text;
          onInterim?.(text);
        };
        sr.onerror = () => {};
        sr.onend = () => {
          // Chrome ends recognition on its own sometimes; restart while listening.
          if (phaseRef.current === 'listening' && recognitionRef.current === sr) {
            try {
              sr.start();
            } catch {
              /* already running or torn down */
            }
          }
        };
        try {
          sr.start();
        } catch {
          /* not fatal — recording continues without live text */
        }
      }
      setPhase('listening');
    } catch {
      teardown();
      setPhase('idle');
      onNotice?.('The microphone was not allowed. You can enable it in your browser settings, or just type.');
    }
  }, [finish, onInterim, onNotice, setPhase, startMeter, stopListening, teardown]);

  if (!canRecord) return null;

  const mmss = `${String(Math.floor(seconds / 60))}:${String(seconds % 60).padStart(2, '0')}`;

  if (phase === 'listening') {
    return (
      <button
        type="button"
        onClick={stopListening}
        aria-pressed="true"
        aria-label="Stop listening"
        title="Stop (Escape throws it away)"
        className="shrink-0 flex items-center gap-2 rounded-md bg-red-600 text-white px-3 h-11 hover:bg-red-700 transition-colors"
      >
        <svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor" aria-hidden>
          <rect x="6" y="6" width="12" height="12" />
        </svg>
        <span className="flex h-4 items-center gap-[2px]" aria-hidden>
          {levels.map((level, i) => (
            <span
              key={i}
              className="w-[2px] rounded-full bg-white transition-[height] duration-75 ease-out"
              style={{ height: `${Math.max(2, Math.round(level * 16))}px` }}
            />
          ))}
        </span>
        <span className="text-[11px] tabular-nums">{mmss}</span>
      </button>
    );
  }

  if (phase === 'transcribing') {
    return (
      <span className="shrink-0 flex items-center gap-2 rounded-md border border-gold-300 bg-gold-50 text-gold-700 px-3 h-11 text-[11px]">
        <span aria-hidden className="inline-block w-2 h-2 rounded-full bg-gold-700 animate-pulse" />
        Writing it down
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={startListening}
      disabled={disabled}
      aria-pressed="false"
      aria-label="Ask by voice"
      title="Say it instead"
      /* Curved and a shade darker than the box it sits in, so it reads as a
         button rather than a white cut-out (Kieran, 4 Aug). */
      className="shrink-0 w-11 h-11 flex items-center justify-center rounded-md border border-stone-300 bg-stone-100 text-stone-600 hover:border-gold-400 hover:text-gold-700 transition-colors disabled:opacity-40"
    >
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden>
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 15a3 3 0 003-3V6a3 3 0 10-6 0v6a3 3 0 003 3z" />
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M18 11a6 6 0 01-12 0M12 17v4" />
      </svg>
    </button>
  );
}
