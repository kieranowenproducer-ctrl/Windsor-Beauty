import { NextResponse } from 'next/server';
import { resolveCustomerFromRequest } from '@/lib/auth';
import { conciergeAvailableTo, isSignedInAdmin } from '@/lib/concierge/availability';
import { buildWhisperPrompt, applyCorrections } from '@/lib/voice/vocabulary';
import { recordCustomerTranscription } from '@/lib/costs/record';

export const dynamic = 'force-dynamic';

// Voice-to-text for the signed-in account concierge. Receives a short recording
// from the VoiceMic component and returns the transcription. Privacy matches
// the admin route: the audio is transcribed and discarded, never stored.
//
// This is a PAID call a customer can trigger, so everything protective happens
// BEFORE the OpenAI request: customer session, concierge availability, a rate
// limit, a byte cap and a mime allowlist. The model is gpt-4o-mini-transcribe —
// the same one the Social Engine's studio uses, at half whisper-1's price and
// better on proper nouns.

const MAX_BYTES = 8 * 1024 * 1024; // ~2 minutes of browser webm/opus is well under 1MB
const ALLOWED_TYPES = ['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/ogg'];

// Per-customer rate limit, checked before any money is spent. In-memory, so on
// serverless it is per warm instance rather than global — an imperfect fence,
// but combined with the session gate and the 2-minute recording cap it bounds
// the worst case to pennies. The window resets hourly.
const BUCKET_LIMIT = 20;
const buckets = new Map<string, { count: number; resetAt: number }>();
function takeToken(customerId: string): boolean {
  const now = Date.now();
  const b = buckets.get(customerId);
  if (!b || now >= b.resetAt) {
    buckets.set(customerId, { count: 1, resetAt: now + 60 * 60 * 1000 });
    return true;
  }
  if (b.count >= BUCKET_LIMIT) return false;
  b.count += 1;
  return true;
}

export async function POST(request: Request) {
  const customer = await resolveCustomerFromRequest(request);
  // Staff signed in to the admin panel get the microphone too, on their own
  // hourly bucket, so the voice button is not dead for the people reviewing it.
  const admin = isSignedInAdmin(request);
  if (!customer && !admin) return NextResponse.json({ error: 'Not signed in.' }, { status: 401 });
  if (!conciergeAvailableTo(customer?.email ?? null, { isAdmin: admin })) {
    return NextResponse.json({ error: 'The concierge is not open to this account yet.' }, { status: 403 });
  }
  if (!takeToken(customer ? String(customer.id) : 'staff:admin')) {
    return NextResponse.json({ error: 'That is a lot of voice notes in one hour. Type this one, or try again later.' }, { status: 429 });
  }
  const key = process.env.OPENAI_API_KEY;
  if (!key) return NextResponse.json({ error: 'Voice input is not available right now. Typing works just as well.' }, { status: 503 });

  const form = await request.formData().catch(() => null);
  const audio = form?.get('audio');
  if (!audio || typeof audio === 'string') return NextResponse.json({ error: 'No audio received. Try recording again.' }, { status: 400 });
  const file = audio as File;
  if (file.size > MAX_BYTES) return NextResponse.json({ error: 'That recording is too long. Keep voice notes under two minutes.' }, { status: 400 });
  if (file.size < 2000) return NextResponse.json({ error: 'The recording was empty. Check the microphone picked you up.' }, { status: 400 });
  const baseType = (file.type || '').split(';')[0].trim();
  if (baseType && !ALLOWED_TYPES.includes(baseType)) {
    return NextResponse.json({ error: 'That audio format is not supported.' }, { status: 415 });
  }

  try {
    const out = new FormData();
    out.append('file', file, file.name || 'note.webm');
    out.append('model', 'gpt-4o-mini-transcribe');
    out.append('language', 'en');
    out.append('prompt', buildWhisperPrompt('general'));

    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}` },
      body: out,
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      console.error('[account voice-transcribe] error:', d?.error?.message ?? r.status);
      return NextResponse.json({ error: 'I could not write that down. Try again, or type it instead.' }, { status: 502 });
    }

    // This model does not report the audio length, so the browser sends what it
    // timed and the file size backs it up (webm/opus ≈ 3000 bytes a second).
    // Clamped so a dishonest header cannot inflate the ledger.
    const claimed = Number(form?.get('durationSeconds'));
    const seconds = Number.isFinite(claimed) && claimed > 0
      ? Math.min(120, Math.round(claimed))
      : Math.min(120, Math.max(1, Math.round(file.size / 3000)));
    await recordCustomerTranscription({ seconds }).catch(() => {});

    const text = applyCorrections(String(d.text ?? '').trim());
    if (!text) return NextResponse.json({ error: 'I did not catch anything. Try again closer to the microphone.' }, { status: 422 });
    return NextResponse.json({ ok: true, text });
  } catch (err) {
    console.error('[account voice-transcribe] fatal:', err instanceof Error ? err.message : err);
    return NextResponse.json({ error: 'I could not write that down. Check the connection and try again.' }, { status: 502 });
  }
}
