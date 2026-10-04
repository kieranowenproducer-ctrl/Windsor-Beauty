'use client';

import { useEffect, useRef, useState } from 'react';
import { currentLeafletWebsite } from '@/lib/qrOperationalDomain';

export interface LeafletFields {
  headline: string;
  subheading: string;
  cta: string;
  qrLabel: string;
  footer: string;
  discountText: string;
  website: string;
  showLocationName: boolean;
}

export const DEFAULT_LEAFLET_FIELDS: LeafletFields = {
  headline: 'Windsor Beauty',
  subheading: 'Premium skincare for every day',
  cta: 'Scan to visit the Windsor Beauty website',
  qrLabel: 'Scan me',
  footer: 'windsorbeauty.is',
  discountText: '',
  website: 'windsorbeauty.is',
  showLocationName: false,
};

interface Props {
  trackingUrl: string;
  slug: string;
  campaignName: string;
  partnerName: string | null;
  discountCode: string | null;
  campaignId: number;
  /** Free-text leaflet headline override, e.g. "Exclusive for salon guests" — cosmetic only, saved on the campaign itself (not the localStorage leaflet text below). */
  bespokeTitle: string | null;
}

// Longer bespoke titles need to shrink slightly so they never overlap the
// QR code or run wider than the leaflet — same threshold used for both the
// live preview and the print template so they always match.
function bespokeTitleFontSize(text: string, base: number): number {
  if (text.length > 60) return Math.round(base * 0.72);
  if (text.length > 40) return Math.round(base * 0.85);
  return base;
}

const STORAGE_KEY = (id: number) => `wb_leaflet_${id}`;

function loadFields(id: number, discountCode: string | null): LeafletFields {
  if (typeof window === 'undefined') return { ...DEFAULT_LEAFLET_FIELDS };
  try {
    const stored = localStorage.getItem(STORAGE_KEY(id));
    if (stored) {
      const fields = { ...DEFAULT_LEAFLET_FIELDS, ...JSON.parse(stored) };
      if (typeof fields.website === 'string') fields.website = currentLeafletWebsite(fields.website);
      return fields;
    }
  } catch { /* ignore */ }
  return {
    ...DEFAULT_LEAFLET_FIELDS,
    discountText: discountCode ? `Use code ${discountCode} at checkout` : '',
  };
}

function saveFields(id: number, fields: LeafletFields) {
  try { localStorage.setItem(STORAGE_KEY(id), JSON.stringify(fields)); } catch { /* ignore */ }
}

export default function CampaignLeaflet({ trackingUrl, slug, campaignName, partnerName, discountCode, campaignId, bespokeTitle }: Props) {
  const leafletRef = useRef<HTMLDivElement>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [fields, setFields] = useState<LeafletFields>(() => loadFields(campaignId, discountCode));
  const [downloading, setDownloading] = useState(false);
  const [printing, setPrinting] = useState(false);
  const [saved, setSaved] = useState(false);

  // Reload fields when campaign changes
  useEffect(() => {
    setFields(loadFields(campaignId, discountCode));
  }, [campaignId, discountCode]);

  // Generate QR code as data URL
  useEffect(() => {
    let cancelled = false;
    async function gen() {
      try {
        const QRCode = (await import('qrcode')).default;
        const url = await QRCode.toDataURL(trackingUrl, {
          width: 320,
          margin: 1,
          color: { dark: '#1c1917', light: '#ffffff' },
          errorCorrectionLevel: 'M',
        });
        if (!cancelled) setQrDataUrl(url);
      } catch { /* ignore */ }
    }
    gen();
    return () => { cancelled = true; };
  }, [trackingUrl]);

  function updateField<K extends keyof LeafletFields>(key: K, value: LeafletFields[K]) {
    setFields(prev => {
      const next = { ...prev, [key]: value };
      saveFields(campaignId, next);
      return next;
    });
    setSaved(false);
  }

  function handleSaveFields() {
    saveFields(campaignId, fields);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function downloadPng() {
    if (!leafletRef.current) return;
    setDownloading(true);
    try {
      const html2canvas = (await import('html2canvas')).default;
      const canvas = await html2canvas(leafletRef.current, {
        scale: 2,
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      });
      const url = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.href = url;
      link.download = `windsor-beauty-leaflet-${slug}.png`;
      link.click();
    } catch { /* ignore */ } finally {
      setDownloading(false);
    }
  }

  async function handlePrint() {
    if (!qrDataUrl) return;
    setPrinting(true);
    const win = window.open('', '_blank', 'width=700,height=900');
    if (!win) { setPrinting(false); return; }

    const locationLine = fields.showLocationName && (partnerName || campaignName)
      ? `<p style="font-size:9px;letter-spacing:0.18em;text-transform:uppercase;color:#78716c;margin:0 0 16px;">${partnerName || campaignName}</p>`
      : '';
    const discountLine = fields.discountText
      ? `<div style="margin-top:12px;padding:8px 16px;border:1px solid #A9695D;display:inline-block;"><p style="font-size:11px;color:#A9695D;letter-spacing:0.1em;margin:0;font-weight:600;">${fields.discountText}</p></div>`
      : '';
    const bespokeLine = bespokeTitle
      ? `<p class="bespoke-title" style="font-size:${bespokeTitleFontSize(bespokeTitle, 15)}px;">${bespokeTitle}</p>`
      : '';

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Windsor Beauty Leaflet - ${campaignName}</title>
  <style>
    @page { size: A5 portrait; margin: 0; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Georgia, 'Times New Roman', serif; background: #fff; }
    .leaflet { width: 148mm; min-height: 210mm; display: flex; flex-direction: column; background: #fff; }
    .header { background: #1c1917; padding: 20px 24px 18px; text-align: center; }
    .header-title { font-size: 26px; letter-spacing: 0.18em; color: #fff; font-family: Georgia, serif; }
    .header-accent { color: #A9695D; }
    .gold-line { height: 1px; background: linear-gradient(to right, transparent, #A9695D, transparent); margin: 0 24px; }
    .body { flex: 1; padding: 24px 28px; display: flex; flex-direction: column; align-items: center; text-align: center; }
    .headline { font-size: 22px; font-weight: 700; color: #1c1917; letter-spacing: 0.04em; margin-bottom: 8px; font-family: Georgia, serif; }
    .bespoke-title { color: #A9695D; font-style: italic; letter-spacing: 0.02em; margin: 0 0 10px; max-width: 90%; margin-left: auto; margin-right: auto; line-height: 1.3; }
    .subheading { font-size: 12px; color: #78716c; letter-spacing: 0.06em; margin-bottom: 24px; }
    .location { font-size: 9px; letter-spacing: 0.18em; text-transform: uppercase; color: #78716c; margin-bottom: 16px; }
    .qr-wrap { border: 1.5px solid #A9695D; padding: 12px; margin-bottom: 10px; display: inline-block; }
    .qr-wrap img { display: block; width: 140px; height: 140px; }
    .scan-label { font-size: 9px; letter-spacing: 0.22em; text-transform: uppercase; color: #A9695D; margin-bottom: 20px; }
    .divider { width: 60px; height: 1px; background: #A9695D; margin: 0 auto 20px; }
    .cta { font-size: 13px; color: #1c1917; letter-spacing: 0.04em; margin-bottom: 8px; }
    .discount { margin-top: 12px; padding: 8px 16px; border: 1px solid #A9695D; display: inline-block; }
    .discount p { font-size: 11px; color: #A9695D; letter-spacing: 0.1em; font-weight: 600; }
    .website { font-size: 10px; letter-spacing: 0.14em; color: #78716c; margin-top: 20px; font-family: monospace; }
    .footer { border-top: 1px solid #e7e5e4; padding: 12px 28px; text-align: center; }
    .footer p { font-size: 8px; letter-spacing: 0.08em; color: #a8a29e; }
  </style>
</head>
<body>
  <div class="leaflet">
    <div class="header">
      <div class="header-title">WINDSOR <span class="header-accent">BEAUTY</span></div>
    </div>
    <div class="gold-line"></div>
    <div class="body">
      <h1 class="headline">${fields.headline}</h1>
      ${bespokeLine}
      <p class="subheading">${fields.subheading}</p>
      ${locationLine}
      <div class="qr-wrap"><img src="${qrDataUrl}" alt="QR Code" /></div>
      <p class="scan-label">${fields.qrLabel}</p>
      <div class="divider"></div>
      <p class="cta">${fields.cta}</p>
      ${discountLine}
      <p class="website">${fields.website}</p>
    </div>
    <div class="footer">
      <p>${fields.footer}</p>
    </div>
  </div>
  <script>window.onload = function() { setTimeout(function() { window.print(); }, 400); }<\/script>
</body>
</html>`);
    win.document.close();
    setTimeout(() => setPrinting(false), 1000);
  }

  const displayName = fields.showLocationName ? (partnerName || campaignName) : null;

  return (
    <div className="space-y-5">
      {/* Preview */}
      <div>
        <p className="text-[8px] tracking-widest uppercase text-stone-500 mb-3">Leaflet Preview</p>
        <div className="overflow-auto">
          <div
            ref={leafletRef}
            style={{
              width: 320,
              minHeight: 450,
              background: '#ffffff',
              display: 'flex',
              flexDirection: 'column',
              fontFamily: 'Georgia, "Times New Roman", serif',
              border: '1px solid #e7e5e4',
              flexShrink: 0,
            }}
          >
            {/* Header */}
            <div style={{ background: '#1c1917', padding: '14px 18px 12px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, letterSpacing: '0.18em', color: '#ffffff' }}>
                WINDSOR <span style={{ color: '#A9695D' }}>BEAUTY</span>
              </div>
            </div>
            {/* Gold line */}
            <div style={{ height: 1, background: 'linear-gradient(to right, transparent, #A9695D, transparent)', margin: '0 18px' }} />

            {/* Body */}
            <div style={{ flex: 1, padding: '18px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center' }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1c1917', letterSpacing: '0.04em', marginBottom: 6 }}>
                {fields.headline}
              </h2>
              {bespokeTitle && (
                <p
                  style={{
                    fontSize: bespokeTitleFontSize(bespokeTitle, 11),
                    color: '#A9695D',
                    fontStyle: 'italic',
                    letterSpacing: '0.02em',
                    marginBottom: 8,
                    maxWidth: '90%',
                    lineHeight: 1.3,
                    wordWrap: 'break-word',
                  }}
                >
                  {bespokeTitle}
                </p>
              )}
              <p style={{ fontSize: 10, color: '#78716c', letterSpacing: '0.06em', marginBottom: 16 }}>
                {fields.subheading}
              </p>
              {displayName && (
                <p style={{ fontSize: 8, letterSpacing: '0.18em', textTransform: 'uppercase', color: '#78716c', marginBottom: 12 }}>
                  {displayName}
                </p>
              )}

              {/* QR Code */}
              <div style={{ border: '1.5px solid #A9695D', padding: 8, marginBottom: 8, display: 'inline-block' }}>
                {qrDataUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a QR code generated in the browser as a data: URL, on a leaflet built for printing. next/image cannot optimise a data URL and its wrapper markup breaks the print layout.
                  <img src={qrDataUrl} alt="QR Code" style={{ display: 'block', width: 120, height: 120 }} />
                ) : (
                  <div style={{ width: 120, height: 120, background: '#f5f4f3', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span style={{ fontSize: 9, color: '#a8a29e' }}>Generating…</span>
                  </div>
                )}
              </div>
              <p style={{ fontSize: 8, letterSpacing: '0.22em', textTransform: 'uppercase', color: '#A9695D', marginBottom: 16 }}>
                {fields.qrLabel}
              </p>

              {/* Divider */}
              <div style={{ width: 40, height: 1, background: '#A9695D', margin: '0 auto 14px' }} />

              <p style={{ fontSize: 11, color: '#1c1917', letterSpacing: '0.04em', marginBottom: 6 }}>
                {fields.cta}
              </p>

              {fields.discountText && (
                <div style={{ marginTop: 10, padding: '6px 12px', border: '1px solid #A9695D', display: 'inline-block' }}>
                  <p style={{ fontSize: 9, color: '#A9695D', letterSpacing: '0.1em', fontWeight: 600 }}>
                    {fields.discountText}
                  </p>
                </div>
              )}

              <p style={{ fontSize: 9, letterSpacing: '0.14em', color: '#78716c', marginTop: 14, fontFamily: 'monospace' }}>
                {fields.website}
              </p>
            </div>

            {/* Footer */}
            <div style={{ borderTop: '1px solid #e7e5e4', padding: '8px 18px', textAlign: 'center' }}>
              <p style={{ fontSize: 7, letterSpacing: '0.08em', color: '#a8a29e' }}>{fields.footer}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Download / Print actions */}
      <div className="flex gap-2">
        <button
          onClick={downloadPng}
          disabled={downloading || !qrDataUrl}
          className="flex-1 border border-gold-300 text-gold-700 text-[9px] tracking-[0.18em] uppercase py-2 hover:bg-gold-50 hover:border-gold-400 transition-colors disabled:opacity-40"
        >
          {downloading ? 'Preparing…' : 'Download PNG'}
        </button>
        <button
          onClick={handlePrint}
          disabled={printing || !qrDataUrl}
          className="flex-1 border border-stone-200 text-stone-500 text-[9px] tracking-[0.18em] uppercase py-2 hover:border-gold-300 hover:text-gold-700 transition-colors disabled:opacity-40"
        >
          {printing ? 'Opening…' : 'Print'}
        </button>
      </div>

      {/* Editable fields */}
      <div>
        <p className="text-[8px] tracking-widest uppercase text-stone-500 mb-3">Edit Leaflet Text</p>
        <div className="space-y-2">
          {([
            { key: 'headline', label: 'Headline' },
            { key: 'subheading', label: 'Subheading' },
            { key: 'cta', label: 'Call to Action' },
            { key: 'qrLabel', label: 'QR Label' },
            { key: 'discountText', label: 'Discount Text (leave blank to hide)' },
            { key: 'website', label: 'Website URL' },
            { key: 'footer', label: 'Footer' },
          ] as { key: keyof LeafletFields; label: string }[]).map(({ key, label }) => (
            <div key={key}>
              <label className="block text-[8px] tracking-wider uppercase text-stone-500 mb-1">{label}</label>
              <input
                type="text"
                value={fields[key] as string}
                onChange={e => updateField(key, e.target.value)}
                className="w-full border border-stone-200 px-2 py-1.5 text-xs text-stone-700 focus:border-gold-400 outline-none"
              />
            </div>
          ))}
          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="showLocation"
              checked={fields.showLocationName}
              onChange={e => updateField('showLocationName', e.target.checked)}
              className="accent-gold-500"
            />
            <label htmlFor="showLocation" className="text-xs text-stone-500">
              Show location name ({partnerName || campaignName})
            </label>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <button
            onClick={handleSaveFields}
            className="text-[10px] font-bold tracking-[0.18em] uppercase text-gold-700 border border-gold-300 px-3 py-1.5 hover:border-gold-500 hover:bg-gold-50 transition-colors"
          >
            Save Text
          </button>
          {saved && <span className="text-[9px] text-green-600">Saved</span>}
          <button
            onClick={() => {
              const reset = { ...DEFAULT_LEAFLET_FIELDS, discountText: discountCode ? `Use code ${discountCode} at checkout` : '' };
              setFields(reset);
              saveFields(campaignId, reset);
            }}
            className="text-[9px] tracking-[0.18em] uppercase text-stone-300 hover:text-stone-500 transition-colors ml-auto"
          >
            Reset to Defaults
          </button>
        </div>
      </div>
    </div>
  );
}
