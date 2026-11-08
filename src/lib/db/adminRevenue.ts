import { requireDb } from './client';
import { REPORT_PAID_STATUSES, encodeReportCursor, type ReportCursor } from '@/lib/adminReportPaging';

type RevenueRow = {id: number; order_number: string; customer_name: string; received: string; status: string; payment_confirmed_at: string; cursor_at: string};
export async function readAdminRevenue(range: { from: string; to: string }, cursor: ReportCursor | null) {
  const db = requireDb();
  // One statement gives totals, chart and table the same database snapshot.
  // Full-range aggregates are never limited to the most recent orders.
  const rows = await db`
    WITH confirmed AS MATERIALIZED (
      SELECT id,order_number,customer_name,total,paypal_fee,status,payment_confirmed_at
      FROM orders WHERE payment_confirmed_at IS NOT NULL
        AND (${range.from || null}::date IS NULL OR (payment_confirmed_at AT TIME ZONE 'Europe/London')::date >= ${range.from || null}::date)
        AND (${range.to || null}::date IS NULL OR (payment_confirmed_at AT TIME ZONE 'Europe/London')::date <= ${range.to || null}::date)
    ), paid AS (
      SELECT * FROM confirmed WHERE status=ANY(${REPORT_PAID_STATUSES}::text[])
    ), months AS (
      SELECT to_char(payment_confirmed_at AT TIME ZONE 'Europe/London','YYYY-MM') AS month,
        SUM(total-COALESCE(paypal_fee,0))::text AS revenue FROM paid GROUP BY month
    ), page AS (
      SELECT *, (total-COALESCE(paypal_fee,0))::text AS received,
        to_char(payment_confirmed_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM paid
      WHERE (${cursor?.at ?? null}::timestamptz IS NULL OR (payment_confirmed_at,id::text) < (${cursor?.at ?? null}::timestamptz,${cursor?.key ?? ''}::text))
      ORDER BY payment_confirmed_at DESC,id::text DESC LIMIT 51
    )
    SELECT COUNT(*)::int AS count,COALESCE(SUM(total-COALESCE(paypal_fee,0)),0)::text AS total,
      (SELECT COUNT(*)::int FROM confirmed) AS accounting_count,
      COALESCE((SELECT jsonb_agg(to_jsonb(months) ORDER BY month) FROM months),'[]'::jsonb) AS months,
      COALESCE((SELECT jsonb_agg(to_jsonb(page) ORDER BY payment_confirmed_at DESC,id::text DESC) FROM page),'[]'::jsonb) AS orders
    FROM paid
  `;
  const result=rows[0];
  const source=result.orders as RevenueRow[], page=source.slice(0,50),last=page.at(-1);
  return {
    count:Number(result.count),total:Number(result.total),accountingCount:Number(result.accounting_count),
    months:(result.months as {month:string;revenue:string}[]).map(row=>({month:row.month,revenue:Number(row.revenue)})),
    orders:page.map(row=>({orderNumber:row.order_number,customerName:row.customer_name,
      paidAt:new Date(row.payment_confirmed_at).toISOString(),status:row.status,
      received:Number(row.received)})),
    nextCursor:source.length>50&&last?encodeReportCursor({priority:0,at:last.cursor_at,key:String(last.id)}):null,
  };
}
