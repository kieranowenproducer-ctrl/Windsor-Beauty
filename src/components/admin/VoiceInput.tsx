'use client';

// VoiceInput (v3 Stage 7) — a microphone button that turns speech into text for
// any admin field. Press to record (clear pulsing state + timer), press again to
// stop; the transcription is appended into the field via onText so the user can
// review and edit BEFORE submitting. Cancel discards. Nothing is ever
// auto-submitted, and the audio itself is discarded after transcription.
//
// Usage: <VoiceInput context="task" onText={(t) => setValue(v => v ? v + ' ' + t : t)} />

import { useEffect, useRef, useState } from 'react';
import type { VoiceContext } from '@/lib/voice/vocabulary';

const MAX_SECONDS = 4 * 60; // hard stop so a forgotten mic can't record forever

export default function VoiceInput({ context = 'general', onText, className = '' }: {
  context?: VoiceContext;
  onText: (text: string) => void;
  className?: string;
}) {
  const [state, setState] = useState<'idle' | 'recording' | 'busy'>('idle');
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState('');
  const recRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelledRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => { // unmount: stop any live recording + tracks
    try { recRef.current?.stream.getTracks().forEach((t) => t.stop()); } catch { /* noop */ }
    if (timerRef.current) clearInterval(timerRef.current);
  }, []);

  async function start() {
    setError('');
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch {
      setError('Microphone blocked — allow mic access for this site in the browser settings, then try again.');
      return;
    }
    // Safari records audio/mp4; Chrome/Edge/Firefox audio/webm.
    const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
    const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
    chunksRef.current = [];
    cancelledRef.current = false;
    rec.ondataavailable = (e) => { if (e.data.size) chunksRef.current.push(e.data); };
    rec.onstop = async () => {
      stream.getTracks().forEach((t) => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      setSeconds(0);
      if (cancelledRef.current) { setState('idle'); return; }
      const type = rec.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      setState('busy');
      try {
        const form = new FormData();
        form.append('audio', blob, type.includes('mp4') ? 'note.mp4' : 'note.webm');
        form.append('context', context);
        const r = await fetch('/api/admin/voice-transcribe', { method: 'POST', body: form });
        const d = await r.json().catch(() => ({}));
        if (!r.ok) { setError(d.error ?? 'Transcription failed — try again.'); setState('idle'); return; }
        onText(String(d.text));
        setState('idle');
      } catch {
        setError('Could not reach the transcription service — check the connection and try again.');
        setState('idle');
      }
    };
    recRef.current = rec;
    rec.start();
    setState('recording');
    setSeconds(0);
    timerRef.current = setInterval(() => setSeconds((s) => {
      if (s + 1 >= MAX_SECONDS) { try { rec.stop(); } catch { /* noop */ } }
      return s + 1;
    }), 1000);
  }

  const stop = () => { try { recRef.current?.stop(); } catch { /* noop */ } };
  const cancel = () => { cancelledRef.current = true; stop(); };
  const mmss = `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      {state === 'idle' && (
        <button type="button" onClick={() => void start()} title="Dictate instead of typing"
          aria-label="Start voice input"
          className="inline-flex h-7 w-7 items-center justify-center rounded-full border border-stone-300 text-stone-500 hover:border-amber-500 hover:text-amber-600 transition-colors">
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        </button>
      )}
      {state === 'recording' && (
        <>
          <button type="button" onClick={stop} title="Stop and transcribe" aria-label="Stop recording"
            className="inline-flex h-7 items-center gap-1.5 rounded-full bg-red-600 px-2.5 text-[11px] font-semibold text-white hover:bg-red-700">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-white" />
            {mmss} · Stop
          </button>
          <button type="button" onClick={cancel} aria-label="Cancel recording"
            className="text-[11px] text-stone-400 hover:text-stone-600">Cancel</button>
        </>
      )}
      {state === 'busy' && (
        <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-stone-200 bg-stone-50 px-2.5 text-[11px] text-stone-500">
          <span className="inline-block h-2 w-2 animate-ping rounded-full bg-amber-500" />
          Transcribing…
        </span>
      )}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </span>
  );
}
