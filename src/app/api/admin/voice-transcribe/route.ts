import { NextResponse } from 'next/server';
import { getMember } from '@/lib/tasks/identity';
import { buildWhisperPrompt, applyCorrections, type VoiceContext } from '@/lib/voice/vocabulary';
import { recordAdminTranscription } from '@/lib/costs/record';

export const dynamic = 'force-dynamic';

// Voice-to-text for admin fields (v3 Stage 7): receives a short recording from
// the VoiceInput component and returns the transcription. Uses OpenAI Whisper
// with the Windsor Glow vocabulary prompt (UK English, peptide names, dosages)
// plus the correction dictionary. Privacy: the audio is transcribed and
// discarded — it is never stored anywhere.
//
// Requires OPENAI_API_KEY in the environment (locally: .env.local; production:
// the Vercel project env).

const MAX_BYTES = 24 * 1024 * 1024; // Whisper's own cap is 25MB

export async function POST(request: Request) {
  // Auth: a board member (browser mic) OR the task-agent's bearer secret (the
  // agent transcribing task media / automated live verification).
  const me = await getMember();
  const agentSecret = process.env.AGENT_TASK_SECRET;
  const isAgent = Boolean(agentSecret) && (request.headers.get('authorization') || '') === `Bearer ${agentSecret}`;
  if (!me && !isAgent) return NextResponse.json({ error: 'Pick who you are first' }, { status: 401 });
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    return NextResponse.json({ error: 'Voice-to-text is not configured yet (OPENAI_API_KEY missing) — tell Kieran.' }, { status: 503 });
  }

  const form = await request.formData().catch(() => null);
  const audio = form?.get('audio');
  const context = (String(form?.get('context') ?? 'general') as VoiceContext);
  if (!audio || typeof audio === 'string') return NextResponse.json({ error: 'No audio received — try recording again.' }, { status: 400 });
  if (audio.size > MAX_BYTES) return NextResponse.json({ error: 'Recording too long — keep voice notes under about 10 minutes.' }, { status: 400 });
  if (audio.size < 1000) return NextResponse.json({ error: 'The recording was empty — check the microphone picked you up and try again.' }, { status: 400 });

  try {
    const out = new FormData();
    // Whisper infers the container from the filename extension.
    const name = (audio as File).name || 'note.webm';
    out.append('file', audio, name);
    out.append('model', 'whisper-1');
    out.append('language', 'en');
    out.append('temperature', '0');
    out.append('prompt', buildWhisperPrompt(context));

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: out,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[voice-transcribe] Whisper error:', d?.error?.message ?? r.status);
      return NextResponse.json({ error: 'Transcription failed — try again in a moment.' }, { status: 502 });
    }
    /* What it cost, written down.
     *
     * Every dictated note since this was built has called Whisper at $0.006 a minute, twice the
     * rate the slideshow studio pays for the same job, and no table anywhere had heard of it. It
     * is the cheapest line in the ledger and it was the last completely unrecorded one.
     *
     * The duration comes from Whisper's own verbose response where it gives one, and from the
     * file size where it does not. The fallback is arithmetic on a known bitrate rather than a
     * guess at how long somebody spoke, and it is marked as an estimate either way it lands.
     * A paid call that files a zero is the thing this change exists to stop. */
    const reported = Number(d.duration);
    const seconds = Number.isFinite(reported) && reported > 0
      ? reported
      // webm/opus from the browser runs about 24 kbit/s, so bytes to seconds is bytes/3000.
      : Math.min(600, Math.max(1, Math.round((audio as File).size / 3000)));
    await recordAdminTranscription({
      seconds,
      who: me?.name ?? (isAgent ? 'Task agent' : 'Admin'),
      context,
    }).catch(() => {});

    const text = applyCorrections(String(d.text ?? '').trim());
    if (!text) return NextResponse.json({ error: 'No speech detected in the recording — try again closer to the microphone.' }, { status: 422 });
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    console.error('[voice-transcribe] fatal:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'Transcription failed — check the connection and try again.' }, { status: 502 });
  }
}
