'use client';

import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line,
} from 'recharts';

interface CampaignStats {
  campaign_id: number;
  total_scans: number;
  unique_visitors: number;
  total_signups: number;
  total_orders: number;
  total_revenue: number;
  conversion_rate: number;
  avg_order_value: number;
  revenue_per_scan: number;
  revenue_per_signup: number;
  avg_customer_ltv: number;
  repeat_purchase_rate: number;
}

interface Campaign {
  id: number;
  name: string;
  slug: string;
  status: 'active' | 'paused' | 'archived';
  partner_name: string | null;
  campaign_type: string | null;
}

interface QrChartsProps {
  campaigns: Campaign[];
  stats: Record<number, CampaignStats>;
  scansTimeSeries: { date: string; count: number }[];
  ordersTimeSeries: { date: string; orders: number; revenue: number }[];
}

const GOLD = '#A9695D';
const GOLD_LIGHT = '#B98478';
const STONE = '#78716c';
const STONE_LIGHT = '#e7e5e4';

function shortName(name: string, max = 18): string {
  return name.length > max ? name.slice(0, max - 1) + '…' : name;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

const CustomTooltipStyle: React.CSSProperties = {
  background: '#fff',
  border: '1px solid #e7e5e4',
  borderRadius: 0,
  padding: '8px 12px',
  fontSize: 11,
  color: '#1c1917',
};

function ScanTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CustomTooltipStyle}>
      <p style={{ color: STONE, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</p>
      <p style={{ fontWeight: 600, color: GOLD }}>{payload[0].value.toLocaleString()} scans</p>
    </div>
  );
}

function RevenueTooltip({ active, payload, label }: { active?: boolean; payload?: { value: number }[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CustomTooltipStyle}>
      <p style={{ color: STONE, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</p>
      <p style={{ fontWeight: 600, color: GOLD }}>£{Number(payload[0].value).toFixed(2)}</p>
    </div>
  );
}

function LineTooltip({ active, payload, label, type }: { active?: boolean; payload?: { value: number }[]; label?: string; type: 'scans' | 'revenue' | 'orders' }) {
  if (!active || !payload?.length) return null;
  const val = payload[0].value;
  return (
    <div style={CustomTooltipStyle}>
      <p style={{ color: STONE, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{label ? formatDate(label) : ''}</p>
      <p style={{ fontWeight: 600, color: GOLD }}>
        {type === 'revenue' ? `£${Number(val).toFixed(2)}` : val.toLocaleString()}
        {' '}{type === 'scans' ? 'scans' : type === 'orders' ? 'orders' : ''}
      </p>
    </div>
  );
}

export default function QrCharts({ campaigns, stats, scansTimeSeries, ordersTimeSeries }: QrChartsProps) {
  const activeCampaigns = campaigns.filter(c => c.status !== 'archived');

  const scanData = [...activeCampaigns]
    .map(c => ({ name: shortName(c.name), scans: stats[c.id]?.total_scans ?? 0 }))
    .sort((a, b) => b.scans - a.scans)
    .slice(0, 10);

  const revenueData = [...activeCampaigns]
    .map(c => ({ name: shortName(c.name), revenue: stats[c.id]?.total_revenue ?? 0 }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 10);

  const conversionData = [...activeCampaigns]
    .filter(c => (stats[c.id]?.total_scans ?? 0) > 0)
    .map(c => ({
      name: shortName(c.name),
      rate: Number((stats[c.id]?.conversion_rate ?? 0).toFixed(1)),
      orders: stats[c.id]?.total_orders ?? 0,
    }))
    .sort((a, b) => b.rate - a.rate)
    .slice(0, 10);

  const scanTimeData = scansTimeSeries.map(p => ({ date: p.date, count: p.count }));
  const orderTimeData = ordersTimeSeries.map(p => ({ date: p.date, orders: p.orders, revenue: Number(p.revenue) }));

  const hasBarData = scanData.some(d => d.scans > 0) || revenueData.some(d => d.revenue > 0);
  const hasTimeData = scanTimeData.length > 0 || orderTimeData.length > 0;

  const ChartLabel = ({ children }: { children: React.ReactNode }) => (
    <p className="text-[8px] tracking-[0.22em] uppercase text-stone-400 mb-3">{children}</p>
  );

  const EmptyChart = ({ label }: { label: string }) => (
    <div>
      <ChartLabel>{label}</ChartLabel>
      <div className="h-40 flex items-center justify-center border border-stone-100 bg-stone-50">
        <p className="text-[10px] text-stone-300">No data yet — scans will appear here after campaigns go live</p>
      </div>
    </div>
  );

  return (
    <div className="space-y-8">
      {/* Campaign comparison charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {hasBarData ? (
          <>
            <div>
              <ChartLabel>Scans by Campaign</ChartLabel>
              <ResponsiveContainer width="100%" height={Math.max(140, scanData.length * 34)}>
                <BarChart data={scanData} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={STONE_LIGHT} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: STONE }} axisLine={false} tickLine={false} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: STONE }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip content={<ScanTooltip />} cursor={{ fill: '#F3E8D8' }} />
                  <Bar dataKey="scans" fill={GOLD} radius={0} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div>
              <ChartLabel>Revenue by Campaign</ChartLabel>
              <ResponsiveContainer width="100%" height={Math.max(140, revenueData.length * 34)}>
                <BarChart data={revenueData} layout="vertical" margin={{ left: 0, right: 24, top: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={STONE_LIGHT} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 9, fill: STONE }} axisLine={false} tickLine={false} tickFormatter={v => `£${v}`} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: STONE }} axisLine={false} tickLine={false} width={100} />
                  <Tooltip content={<RevenueTooltip />} cursor={{ fill: '#F3E8D8' }} />
                  <Bar dataKey="revenue" fill={GOLD_LIGHT} radius={0} maxBarSize={14} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <>
            <EmptyChart label="Scans by Campaign" />
            <EmptyChart label="Revenue by Campaign" />
          </>
        )}
      </div>

      {/* Conversion rate chart */}
      {conversionData.length > 0 ? (
        <div>
          <ChartLabel>Conversion Rate by Campaign (%)</ChartLabel>
          <ResponsiveContainer width="100%" height={Math.max(120, conversionData.length * 34)}>
            <BarChart data={conversionData} layout="vertical" margin={{ left: 0, right: 48, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={STONE_LIGHT} horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 9, fill: STONE }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 9, fill: STONE }} axisLine={false} tickLine={false} width={100} />
              <Tooltip
                content={({ active, payload, label }) => {
                  if (!active || !payload?.length) return null;
                  return (
                    <div style={CustomTooltipStyle}>
                      <p style={{ color: STONE, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</p>
                      <p style={{ fontWeight: 600, color: GOLD }}>{payload[0].value}% conversion</p>
                      <p style={{ fontSize: 9, color: STONE }}>{(payload[0] as { payload: { orders: number } }).payload.orders} orders</p>
                    </div>
                  );
                }}
                cursor={{ fill: '#F3E8D8' }}
              />
              <Bar dataKey="rate" fill="#16a34a" radius={0} maxBarSize={14} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : null}

      {/* Time-series charts */}
      <div>
        <p className="text-[9px] text-stone-400 leading-relaxed mb-4 bg-stone-50 border border-stone-100 px-3 py-2">
          These two charts track different things, not cause and effect &mdash; a revenue spike on a given day is not
          necessarily from that day&apos;s scans. Orders are credited to a campaign for up to 30 days after the scan
          (see Attribution above), so today&apos;s revenue can come from scans recorded weeks earlier.
        </p>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {hasTimeData ? (
          <>
            <div>
              <ChartLabel>Daily Scans (Last 30 Days)</ChartLabel>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={scanTimeData} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={STONE_LIGHT} />
                  <XAxis dataKey="date" tick={{ fontSize: 8, fill: STONE }} axisLine={false} tickLine={false} tickFormatter={formatDate} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: STONE }} axisLine={false} tickLine={false} allowDecimals={false} width={28} />
                  <Tooltip content={<LineTooltip type="scans" />} />
                  <Line type="monotone" dataKey="count" stroke={GOLD} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: GOLD }} />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div>
              <ChartLabel>Daily Revenue from QR Campaigns (Last 30 Days)</ChartLabel>
              <ResponsiveContainer width="100%" height={160}>
                <LineChart data={orderTimeData} margin={{ left: 0, right: 12, top: 4, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={STONE_LIGHT} />
                  <XAxis dataKey="date" tick={{ fontSize: 8, fill: STONE }} axisLine={false} tickLine={false} tickFormatter={formatDate} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: STONE }} axisLine={false} tickLine={false} width={40} tickFormatter={v => `£${v}`} />
                  <Tooltip content={<LineTooltip type="revenue" />} />
                  <Line type="monotone" dataKey="revenue" stroke={GOLD_LIGHT} strokeWidth={2} dot={false} activeDot={{ r: 3, fill: GOLD_LIGHT }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <>
            <EmptyChart label="Daily Scans (Last 30 Days)" />
            <EmptyChart label="Daily Revenue from QR Campaigns (Last 30 Days)" />
          </>
        )}
        </div>
      </div>
    </div>
  );
}
