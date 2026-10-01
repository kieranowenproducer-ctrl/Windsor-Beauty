import dynamic from 'next/dynamic';

// Moved out of page.tsx unchanged. They live here rather than being repeated in each
// new file so there is still one lazily-loaded copy of each, exactly as before.
export const QrCharts = dynamic(() => import('@/components/admin/qr/QrCharts'), { ssr: false });
export const CampaignLeaflet = dynamic(() => import('@/components/admin/qr/CampaignLeaflet'), { ssr: false });
export const QRCodeDisplay = dynamic(() => import('@/components/admin/QRCodeDisplay'), { ssr: false });
