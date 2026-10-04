'use client';

import {
  CAMPAIGN_TYPES,
  DESTINATION_PRESETS,
  EMPTY_FORM,
  type Campaign,
  type CampaignStatus,
} from './qrCampaignTypes';
import { useVisualViewport } from '@/components/useVisualViewport';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  showCreate: boolean;
  setShowCreate: (value: boolean) => void;
  isEditing: boolean;
  form: typeof EMPTY_FORM;
  setForm: (update: (prev: typeof EMPTY_FORM) => typeof EMPTY_FORM) => void;
  selected: Campaign | null;
  destinationPreset: string;
  handleDestinationPresetChange: (value: string) => void;
  handleSave: () => void;
  saving: boolean;
  saveError: string;
}

export default function CampaignFormModal({
  showCreate, setShowCreate, isEditing, form, setForm, selected, destinationPreset, handleDestinationPresetChange, handleSave, saving, saveError,
}: Props) {
  // Sized to the visible screen so Save and Cancel stay reachable with the
  // keyboard open (task 43f558e8, same fault as the customer message box).
  const screen = useVisualViewport();
  const overlayStyle =
    screen.height !== null ? { top: screen.offsetTop, height: screen.height } : undefined;

  return (
    <>
      {/* Create / Edit modal */}
      {showCreate && (
        <div
          className="fixed left-0 right-0 top-0 h-[100svh] z-50 flex items-start sm:items-center justify-center bg-black/30 p-4"
          style={overlayStyle}
        >
          <div className="bg-white border border-stone-200 w-full max-w-lg max-h-full flex flex-col overflow-hidden">
            <div className="shrink-0 bg-white border-b border-stone-100 px-6 py-4 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-stone-800">
                {isEditing ? 'Edit Campaign' : 'New Campaign'}
              </h2>
              <button
                onClick={() => setShowCreate(false)}
                className="text-stone-300 hover:text-stone-500 transition-colors text-lg leading-none"
              >
                &times;
              </button>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-6 space-y-4">
              {isEditing && selected && (
                <div className="bg-stone-50 border border-stone-100 px-3 py-2">
                  <p className="text-[8px] tracking-widest uppercase text-stone-500 mb-0.5">Permanent Tracking URL (cannot be changed)</p>
                  <code className="text-[9px] text-stone-600 font-mono">/r/{selected.slug}</code>
                  <p className="text-[8px] text-stone-500 mt-1 leading-relaxed">
                    The slug is locked - your printed QR codes will always work.
                  </p>
                </div>
              )}

              {!isEditing && (
                <div className="bg-gold-50 border border-gold-100 px-3 py-2">
                  <p className="text-[9px] text-gold-700 leading-relaxed">
                    After creating the campaign, the admin panel will automatically generate your tracking link, QR code, and printable leaflet.
                  </p>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">Campaign Name *</label>
                  <input
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Claire's Aesthetics"
                    className="w-full border border-stone-200 px-3 py-2 text-xs text-stone-700 focus:border-gold-400 outline-none"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">Bespoke Title (optional)</label>
                  <input
                    value={form.bespoke_title}
                    onChange={e => setForm(f => ({ ...f, bespoke_title: e.target.value }))}
                    placeholder="e.g. Exclusive for salon guests"
                    className="w-full border border-stone-200 px-3 py-2 text-xs text-stone-700 focus:border-gold-400 outline-none"
                  />
                  <p className="text-[8px] text-stone-500 mt-1">
                    Shown on the leaflet only, between &ldquo;Windsor Beauty&rdquo; and the subheading. Doesn&rsquo;t affect tracking, URLs, or reporting.
                  </p>
                </div>

                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">Status</label>
                  <select
                    value={form.status}
                    onChange={e => setForm(f => ({ ...f, status: e.target.value as CampaignStatus }))}
                    className="w-full border border-stone-200 px-3 py-2 text-xs text-stone-600 focus:border-gold-400 outline-none bg-white"
                  >
                    <option value="active">Active</option>
                    <option value="paused">Paused</option>
                    <option value="archived">Archived</option>
                  </select>
                </div>

                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">Campaign Type</label>
                  <select
                    value={form.campaign_type}
                    onChange={e => setForm(f => ({ ...f, campaign_type: e.target.value }))}
                    className="w-full border border-stone-200 px-3 py-2 text-xs text-stone-600 focus:border-gold-400 outline-none bg-white"
                  >
                    <option value="">Select type…</option>
                    {CAMPAIGN_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">Partner / Location</label>
                  <input
                    value={form.partner_name}
                    onChange={e => setForm(f => ({ ...f, partner_name: e.target.value }))}
                    placeholder="e.g. Claire's Aesthetics, Windsor"
                    className="w-full border border-stone-200 px-3 py-2 text-xs text-stone-700 focus:border-gold-400 outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">Destination *</label>
                  <select
                    value={destinationPreset}
                    onChange={e => handleDestinationPresetChange(e.target.value)}
                    className="w-full border border-stone-200 px-3 py-2 text-xs text-stone-600 focus:border-gold-400 outline-none bg-white"
                  >
                    {DESTINATION_PRESETS.map(p => (
                      <option key={p.value} value={p.value}>{p.label}</option>
                    ))}
                  </select>
                  {destinationPreset === 'custom' && (
                    <input
                      value={form.destination_url}
                      onChange={e => setForm(f => ({ ...f, destination_url: e.target.value }))}
                      placeholder="https://www.windsorbeauty.is/..."
                      className="w-full border border-stone-200 border-t-0 px-3 py-2 text-xs text-stone-700 focus:border-gold-400 outline-none"
                    />
                  )}
                  {destinationPreset !== 'custom' && (
                    <p className="text-[8px] text-stone-300 mt-1 font-mono truncate">{form.destination_url}</p>
                  )}
                </div>

                <div className="col-span-2">
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">Linked Discount Code (optional)</label>
                  <input
                    value={form.discount_code}
                    onChange={e => setForm(f => ({ ...f, discount_code: e.target.value.toUpperCase() }))}
                    placeholder="e.g. CLAIRE20"
                    className="w-full border border-stone-200 px-3 py-2 text-xs text-stone-700 focus:border-gold-400 outline-none font-mono"
                  />
                  <p className="text-[8px] text-stone-500 mt-1">For reference only. QR attribution works whether or not the code is used at checkout.</p>
                </div>

                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">Start Date</label>
                  <input
                    type="date"
                    value={form.start_date}
                    onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))}
                    className="w-full border border-stone-200 px-3 py-2 text-xs text-stone-700 focus:border-gold-400 outline-none"
                  />
                </div>

                <div>
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">End Date</label>
                  <input
                    type="date"
                    value={form.end_date}
                    onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))}
                    className="w-full border border-stone-200 px-3 py-2 text-xs text-stone-700 focus:border-gold-400 outline-none"
                  />
                </div>

                <div className="col-span-2">
                  <label className="block text-[8px] tracking-widest uppercase text-stone-500 mb-1.5">Notes (internal only)</label>
                  <textarea
                    rows={3}
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Any internal notes about this campaign."
                    className="w-full border border-stone-200 px-3 py-2 text-xs text-stone-700 focus:border-gold-400 outline-none resize-none"
                  />
                </div>
              </div>

              {saveError && (
                <p className="text-[10px] text-red-500">{saveError}</p>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex-1 bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase py-2.5 hover:bg-gold-800 transition-colors disabled:opacity-50"
                >
                  {saving ? 'Saving…' : isEditing ? 'Save Changes' : 'Create Campaign'}
                </button>
                <button
                  onClick={() => setShowCreate(false)}
                  disabled={saving}
                  className="flex-1 border border-stone-200 text-stone-500 text-[9px] tracking-[0.18em] uppercase py-2.5 hover:border-stone-300 transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
