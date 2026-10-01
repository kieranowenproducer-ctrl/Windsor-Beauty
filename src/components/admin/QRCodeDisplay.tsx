'use client';

import { useEffect, useRef, useState } from 'react';

interface Props {
  url: string;
  slug: string;
}

export default function QRCodeDisplay({ url, slug }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [dataUrl, setDataUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function generate() {
      try {
        const QRCode = (await import('qrcode')).default;
        const canvas = canvasRef.current;
        if (!canvas || cancelled) return;
        await QRCode.toCanvas(canvas, url, {
          width: 200,
          margin: 2,
          color: { dark: '#1c1917', light: '#ffffff' },
        });
        setDataUrl(canvas.toDataURL('image/png'));
      } catch {
        // QR generation failed silently
      }
    }
    generate();
    return () => { cancelled = true; };
  }, [url]);

  function downloadPng() {
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.href = dataUrl;
    link.download = `qr-${slug}.png`;
    link.click();
  }

  return (
    <div className="flex flex-col items-center gap-3">
      <canvas ref={canvasRef} className="border border-stone-100" />
      {dataUrl && (
        <button
          type="button"
          onClick={downloadPng}
          className="text-[9px] tracking-[0.18em] uppercase text-gold-700 hover:text-gold-700 transition-colors"
        >
          Download PNG
        </button>
      )}
    </div>
  );
}
