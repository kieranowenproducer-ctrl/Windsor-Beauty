'use client';
import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { hasStaffSession, getPreviewMode, setPreviewMode, type PreviewMode } from '@/lib/staffView';

// Floating control, visible only to signed-in admins, to preview the storefront
// as a customer without logging out. Two flavours:
//   Member — a logged-in member (member pricing).
//   Guest  — a not-logged-in visitor (non-member pricing + signup pitch + popup).
// "Back to admin" restores the full admin view. The real admin session is never
// touched; only a wg_view_as cookie is set.
//
// Placement rules (so it never obstructs the site — task 19b00d4f):
//   - It rests as a COMPACT collapsed pill and only expands on tap, so its
//     footprint can't cover other buttons.
//   - It normally sits at bottom-left, clear of the support chat. The visitor
//     demand page renders it inline instead, so it cannot cover results.
//   - z-40 keeps it BELOW every in-app modal/drawer (those are z-50+), so an
//     open modal always sits above it and stays fully clickable; the modal's
//     own backdrop simply covers this control while it is open.
export default function AdminViewToggle({ inline = false }: { inline?: boolean } = {}) {
  const pathname = usePathname();
  const [staff, setStaff] = useState(false);
  const [mode, setMode] = useState<PreviewMode>('admin');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    setStaff(hasStaffSession());
    setMode(getPreviewMode());
  }, []);
  if (!staff || (pathname === '/admin/ip-addresses' && !inline)) return null;

  const go = (m: PreviewMode) => {
    setPreviewMode(m);
    window.location.reload();
  };
  const previewing = mode !== 'admin';
  const position = inline ? 'relative' : 'fixed bottom-4 left-4';
  const btn = 'text-[11px] tracking-[0.1em] uppercase font-semibold border transition-colors px-3 py-2 flex-1';

  const eye = (
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );

  // Collapsed handle — tiny footprint. When previewing, it stays visible with a
  // dot + short label so the admin never forgets which view they are in.
  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`fixed ${position} z-40 flex items-center gap-2 rounded-full border px-3.5 py-2 text-[11px] font-semibold uppercase tracking-[0.1em] shadow-lg transition-colors ${
          previewing
            ? 'bg-white text-gold-700 border-gold-400 hover:bg-gold-50'
            : 'bg-gold-700 text-white border-gold-600 hover:bg-gold-700'
        }`}
        title="Preview the storefront as a customer"
        aria-label={previewing ? `Previewing as ${mode}. Tap to change view.` : 'Preview as customer'}
      >
        {previewing
          ? <><span className="w-2 h-2 rounded-full bg-gold-700" />{mode === 'member' ? 'Member view' : 'Guest view'}</>
          : <>{eye}Preview</>}
      </button>
    );
  }

  // Expanded — admin: choose a customer view.
  if (mode === 'admin') {
    return (
      <div className={`fixed ${position} z-40 flex flex-col items-stretch shadow-lg`}>
        <div className="flex items-stretch">
          <span className="flex-1 bg-gold-700 text-white text-[10px] tracking-[0.12em] uppercase font-semibold px-3 py-1.5 text-center border border-gold-600">
            Preview as customer
          </span>
          <button onClick={() => setOpen(false)} title="Collapse" aria-label="Collapse"
            className="bg-gold-700 text-white border border-l-0 border-gold-600 px-2.5 hover:bg-gold-700 transition-colors">
            &times;
          </button>
        </div>
        <div className="flex">
          <button
            onClick={() => go('member')}
            className={`${btn} bg-white text-gold-700 border-gold-400 hover:bg-gold-50`}
            title="Preview as a logged-in member (member pricing, no signup pitch)"
          >
            Member
          </button>
          <button
            onClick={() => go('guest')}
            className={`${btn} bg-white text-gold-700 border-gold-400 border-l-0 hover:bg-gold-50`}
            title="Preview as a not-logged-in visitor (non-member pricing, signup pitch, discount popup)"
          >
            Guest
          </button>
        </div>
      </div>
    );
  }

  // Expanded — previewing: switch view or return to admin.
  const label = mode === 'member' ? 'Previewing as member' : 'Previewing as guest';
  return (
    <div className={`fixed ${position} z-40 flex flex-col items-stretch shadow-lg`}>
      <div className="flex items-stretch">
        <span className="flex-1 bg-white text-gold-700 text-[10px] tracking-[0.12em] uppercase font-semibold px-3 py-1.5 text-center border border-gold-400 flex items-center justify-center gap-2">
          <span className="w-2 h-2 rounded-full bg-gold-700" />
          {label}
        </span>
        <button onClick={() => setOpen(false)} title="Collapse" aria-label="Collapse"
          className="bg-white text-gold-700 border border-l-0 border-gold-400 px-2.5 hover:bg-gold-50 transition-colors">
          &times;
        </button>
      </div>
      <div className="flex">
        <button
          onClick={() => go(mode === 'member' ? 'guest' : 'member')}
          className={`${btn} bg-white text-gold-700 border-gold-400 hover:bg-gold-50`}
          title="Switch to the other customer view"
        >
          {mode === 'member' ? 'Switch to guest' : 'Switch to member'}
        </button>
        <button
          onClick={() => go('admin')}
          className={`${btn} bg-gold-700 text-white border-gold-600 border-l-0 hover:bg-gold-700`}
          title="Return to the admin view"
        >
          Back to admin
        </button>
      </div>
    </div>
  );
}
