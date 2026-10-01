import { NextResponse } from 'next/server';
import { costLedgerConfigured, pearlAiDailyCapPence, pearlAiSpentTodayPence } from '@/lib/costs/record';

/**
 * The daily ceiling on Pearl's AI buttons (Pearl repairs Stage E).
 *
 * Each click costs pennies, but nothing bounded the day as a whole. Every AI
 * route asks this gate before calling the model: once today's recorded Pearl
 * spend reaches the cap (PEARL_AI_DAILY_CAP_PENCE, default £2), the button
 * answers honestly and stops. The gate reads the same ledger the calls write
 * to, so the ceiling is measured, not estimated.
 */
export async function pearlAiBudgetStop(): Promise<NextResponse | null> {
  const cap = pearlAiDailyCapPence();
  const spent = await pearlAiSpentTodayPence();

  /* The spend can come back unknown for two very different reasons, and they
     deserve opposite answers.

     Where no ledger is set up at all, spending is not being written down by
     design - a local copy, say - and blocking an admin's work on missing
     bookkeeping would be the wrong trade. The call goes ahead, exactly as
     before.

     Where a ledger IS set up and could not be read, the ceiling is not off by
     choice, it is broken. "I cannot see what has been spent" is the one
     moment a spending limit exists for, so this stops and says so rather than
     spending an unknown amount quietly. */
  if (spent === null) {
    if (!costLedgerConfigured()) return null;
    return NextResponse.json({
      error: 'Pearl could not check what its AI has spent today, so it has not started this job. That check is what keeps the daily limit honest. Try again in a minute. Everything else on this screen still works.',
    }, { status: 503 });
  }

  if (spent >= cap) {
    const pounds = (cap / 100).toFixed(2);
    return NextResponse.json({
      error: `Pearl's AI budget for today (£${pounds}) is used up. It resets at midnight. Everything else on this screen still works.`,
    }, { status: 429 });
  }
  return null;
}
