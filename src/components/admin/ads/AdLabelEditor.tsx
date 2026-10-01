'use client';

import { useState } from 'react';
import { SLOTS, type CreativeLink, type Slot } from '@/lib/ads/labels';

// The inline editor for what a person calls an ad: its letter in the
// comparison (A to E, or none), an experiment note, and which film it used.
// Saves on change, blur or Enter. Every save sends all three values, so the
// row in ad_creative_links is always the whole truth. The answer carries every
// ad's labels, because giving this ad a letter can take it off another.

interface Props {
  adId: string;
  adName: string;
  initial: CreativeLink | undefined;
  onSaved?: (link: CreativeLink, all?: Record<string, CreativeLink>) => void;
  /** 'row' fits a table cell, 'card' is the roomier layout on an ad card. */
  layout?: 'row' | 'card';
}

type SaveState = 'idle' | 'saving' | 'saved' | 'failed';

export default function AdLabelEditor({ adId, adName, initial, onSaved, layout = 'row' }: Props) {
  const [slot, setSlot] = useState<Slot | null>(initial?.slot ?? null);
  const [note, setNote] = useState(initial?.note ?? '');
  const [label, setLabel] = useState(initial?.label ?? '');
  const [state, setState] = useState<SaveState>('idle');
  const [lastSaved, setLastSaved] = useState(JSON.stringify({ slot: initial?.slot ?? null, note: initial?.note ?? '', label: initial?.label ?? '' }));

  async function save(next?: { slot?: Slot | null; note?: string; label?: string }) {
    const body = {
      adId, adName,
      slot: next?.slot !== undefined ? next.slot : slot,
      note: next?.note !== undefined ? next.note : note,
      label: next?.label !== undefined ? next.label : label,
    };
    const key = JSON.stringify({ slot: body.slot, note: body.note, label: body.label });
    if (key === lastSaved) return;
    setState('saving');
    try {
      const res = await fetch('/api/admin/ads/creative', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const answer = (await res.json().catch(() => ({}))) as { links?: Record<string, CreativeLink> | null };
      if (res.ok) {
        setLastSaved(key);
        setState('saved');
        onSaved?.({ adName, slot: body.slot, note: body.note, label: body.label }, answer.links ?? undefined);
      } else {
        setState('failed');
      }
    } catch {
      setState('failed');
    }
  }

  function pickSlot(value: string) {
    const next = (SLOTS as string[]).includes(value) ? (value as Slot) : null;
    setSlot(next);
    void save({ slot: next });
  }

  const inputClass = layout === 'card'
    ? 'w-full text-xs text-stone-700 border border-stone-200 rounded-md px-3 py-2.5 focus:border-gold-500 focus:outline-none placeholder:text-stone-300'
    : 'w-32 text-[11px] text-stone-600 border border-stone-200 rounded-md px-2 py-1 focus:border-gold-500 focus:outline-none placeholder:text-stone-300';

  return (
    <div
      className={layout === 'card' ? 'space-y-2' : 'flex flex-wrap items-center gap-1.5'}
      data-testid="ad-label-editor"
      data-ad-id={adId}
      onClick={(e) => e.stopPropagation()}
    >
      <select
        aria-label="Compare letter"
        value={slot ?? ''}
        onChange={(e) => pickSlot(e.target.value)}
        className={`${layout === 'card' ? 'text-xs' : 'text-[11px]'} text-stone-700 bg-white border border-stone-200 rounded-md px-3 py-2.5 focus:border-gold-500 focus:outline-none`}
      >
        <option value="">Not in the comparison</option>
        {SLOTS.map((s) => (
          <option key={s} value={s}>Ad {s}</option>
        ))}
      </select>
      <input
        type="text"
        value={note}
        placeholder={layout === 'card' ? 'What is this ad testing? e.g. Gym targeting, comments off' : 'what it tests'}
        aria-label="Experiment note"
        onChange={(e) => { setNote(e.target.value); setState('idle'); }}
        onBlur={() => void save()}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={inputClass}
        maxLength={200}
      />
      <input
        type="text"
        value={label}
        placeholder="which film?"
        aria-label="Which film"
        onChange={(e) => { setLabel(e.target.value); setState('idle'); }}
        onBlur={() => void save()}
        onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
        className={inputClass}
        maxLength={200}
      />
      <span className="text-[10px] min-w-[2.5rem]" data-testid="ad-label-state" data-state={state}>
        {state === 'saving' && <span className="text-stone-500">saving</span>}
        {state === 'saved' && <span className="text-gold-700">saved</span>}
        {state === 'failed' && <span className="text-red-600">not saved, try again</span>}
      </span>
    </div>
  );
}
