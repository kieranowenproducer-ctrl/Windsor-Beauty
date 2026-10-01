'use client';

import { PACKAGE_FORMATS, SHIPPING_SERVICES } from '@/data/products';
import type { ShippingSettings } from './dispatchTypes';

// Moved out of page.tsx unchanged. Every prop keeps the name it had as a local
// in the page, so the markup below is the same code that used to live there.

interface Props {
  settingsOpen: boolean;
  setSettingsOpen: (update: (value: boolean) => boolean) => void;
  settingsDraft: ShippingSettings | null;
  setSettingsDraft: (update: (prev: ShippingSettings | null) => ShippingSettings | null) => void;
  saveSettings: () => void;
  settingsSaving: boolean;
  settingsSaved: boolean;
  settingsError: string | null;
}

export default function ShippingSettingsPanel({
  settingsOpen, setSettingsOpen, settingsDraft, setSettingsDraft,
  saveSettings, settingsSaving, settingsSaved, settingsError,
}: Props) {
  return (
    <>
            {/* Shipping settings panel */}
            <div className="border border-stone-200 bg-white mb-4">
              <button
                onClick={() => setSettingsOpen(o => !o)}
                className="w-full flex items-center justify-between px-5 py-3 text-left"
              >
                <span className="text-xs font-semibold text-stone-700">Shipping Settings</span>
                <span className="text-[9px] tracking-[0.15em] uppercase text-stone-500">{settingsOpen ? 'Hide' : 'Show'}</span>
              </button>
              {settingsOpen && settingsDraft && (
                <div className="px-5 py-4 border-t border-stone-100 space-y-3">
                  <p className="text-[10px] text-stone-500 leading-relaxed">
                    Fallback values used to calculate parcel weight and format when a product
                    doesn&apos;t specify its own shipping data. Edit per-product shipping fields on
                    the Products page for more accurate labels.
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Default Item Weight (g)</label>
                      <input
                        type="number" min={1}
                        value={settingsDraft.defaultItemWeightGrams}
                        onChange={e => setSettingsDraft(prev => prev && { ...prev, defaultItemWeightGrams: Number(e.target.value) })}
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Packaging Allowance (g)</label>
                      <input
                        type="number" min={0}
                        value={settingsDraft.packagingWeightGrams}
                        onChange={e => setSettingsDraft(prev => prev && { ...prev, packagingWeightGrams: Number(e.target.value) })}
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Safety Margin (g)</label>
                      <input
                        type="number" min={0}
                        value={settingsDraft.safetyMarginGrams}
                        onChange={e => setSettingsDraft(prev => prev && { ...prev, safetyMarginGrams: Number(e.target.value) })}
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors"
                      />
                    </div>
                    <div>
                      <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Default Package Format</label>
                      <select
                        value={settingsDraft.defaultPackageFormat}
                        onChange={e => setSettingsDraft(prev => prev && { ...prev, defaultPackageFormat: e.target.value })}
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors"
                      >
                        {PACKAGE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Default Shipping Service</label>
                      <select
                        value={settingsDraft.defaultService}
                        onChange={e => setSettingsDraft(prev => prev && { ...prev, defaultService: e.target.value })}
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors"
                      >
                        {SHIPPING_SERVICES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">Default Origin Country</label>
                      <input
                        type="text" maxLength={3}
                        value={settingsDraft.defaultOriginCountry}
                        onChange={e => setSettingsDraft(prev => prev && { ...prev, defaultOriginCountry: e.target.value.toUpperCase() })}
                        className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors uppercase font-mono"
                      />
                    </div>
                  </div>
                  <div className="border-t border-stone-100 pt-3">
                    <p className="text-[10px] text-stone-500 leading-relaxed mb-2">
                      Checkout shipping prices charged to customers. These are also the rates the server
                      uses to verify each order&apos;s shipping cost, so they must be kept in sync with
                      what customers should be charged.
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">UK Delivery Rate (£)</label>
                        <input
                          type="number" min={0} step="0.01"
                          value={settingsDraft.ukStandardRate}
                          onChange={e => setSettingsDraft(prev => prev && { ...prev, ukStandardRate: Number(e.target.value) })}
                          className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-[9px] tracking-[0.15em] uppercase text-stone-500 mb-1">International Delivery Rate (£)</label>
                        <input
                          type="number" min={0} step="0.01"
                          value={settingsDraft.internationalRate}
                          onChange={e => setSettingsDraft(prev => prev && { ...prev, internationalRate: Number(e.target.value) })}
                          className="w-full border border-stone-200 focus:border-gold-400 outline-none px-2 py-2 text-xs text-stone-600 bg-white transition-colors"
                        />
                      </div>
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-[10px] text-stone-500">
                    <input
                      type="checkbox"
                      checked={settingsDraft.internationalEnabled}
                      onChange={e => setSettingsDraft(prev => prev && { ...prev, internationalEnabled: e.target.checked })}
                      className="accent-gold-500"
                    />
                    International shipping enabled (your Royal Mail account supports international labels)
                  </label>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={saveSettings}
                      disabled={settingsSaving}
                      className="bg-gold-700 text-white text-[9px] tracking-[0.18em] uppercase px-4 py-2 hover:bg-gold-800 disabled:opacity-50 transition-colors"
                    >
                      {settingsSaving ? 'Saving…' : 'Save Settings'}
                    </button>
                    {settingsSaved && <span className="text-[9px] text-green-600">Saved.</span>}
                    {settingsError && <span className="text-[9px] text-red-500">{settingsError}</span>}
                  </div>
                </div>
              )}
            </div>
    </>
  );
}
