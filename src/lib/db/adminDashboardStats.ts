import { requireDb } from './client';
import { REPORT_PAID_STATUSES } from '@/lib/adminReportPaging';

export async function readAdminDashboardStats() {
  const db=requireDb();
  const [row]=await db`
    SELECT COUNT(*) FILTER (WHERE payment_confirmed_at IS NOT NULL)::int AS total_orders,
      COUNT(*) FILTER (WHERE status IN ('pending','awaiting_payment','paid','awaiting_dispatch','processing','exported'))::int AS pending_orders,
      COUNT(*) FILTER (WHERE status IN ('pending','awaiting_payment'))::int AS awaiting_payment,
      COUNT(*) FILTER (WHERE status IN ('paid','awaiting_dispatch','processing','exported'))::int AS awaiting_dispatch,
      COUNT(*) FILTER (WHERE status='dispatched')::int AS in_transit,
      COALESCE(SUM(total-COALESCE(paypal_fee,0)) FILTER (WHERE payment_confirmed_at IS NOT NULL AND status=ANY(${REPORT_PAID_STATUSES}::text[])),0) AS revenue,
      COALESCE(SUM(total-COALESCE(paypal_fee,0)) FILTER (WHERE payment_confirmed_at IS NOT NULL AND status=ANY(${REPORT_PAID_STATUSES}::text[])
        AND date_trunc('month',payment_confirmed_at AT TIME ZONE 'Europe/London')=date_trunc('month',now() AT TIME ZONE 'Europe/London')),0) AS this_month_revenue,
      (SELECT COUNT(*)::int FROM customers) AS customer_count,
      (SELECT COUNT(*)::int FROM customers WHERE created_at >= now()-interval '24 hours') AS new_customers_24h,
      (SELECT COUNT(*)::int FROM customers WHERE created_at >= now()-interval '7 days') AS new_customers_7d
    FROM orders
  `;
  return {totalOrders:Number(row.total_orders),pendingOrders:Number(row.pending_orders),awaitingPayment:Number(row.awaiting_payment),
    awaitingDispatch:Number(row.awaiting_dispatch),inTransit:Number(row.in_transit),revenue:Number(row.revenue),
    thisMonthRevenue:Number(row.this_month_revenue),customerCount:Number(row.customer_count),newCustomers24h:Number(row.new_customers_24h),newCustomers7d:Number(row.new_customers_7d)};
}

export async function readAdminDashboardRange(from:string,to:string) {
  const db=requireDb();
  const [row]=await db`
    WITH dated AS (
      SELECT *, (payment_confirmed_at AT TIME ZONE 'Europe/London')::date BETWEEN ${from}::date AND ${to}::date AS paid_in_range,
        (created_at AT TIME ZONE 'Europe/London')::date BETWEEN ${from}::date AND ${to}::date AS created_in_range FROM orders
    )
    SELECT COUNT(*) FILTER (WHERE paid_in_range)::int AS total_orders,
      COUNT(*) FILTER (WHERE status IN ('pending','awaiting_payment') AND created_in_range)::int AS awaiting_payment,
      COUNT(*) FILTER (WHERE status IN ('paid','awaiting_dispatch','processing','exported') AND paid_in_range)::int AS awaiting_dispatch,
      COUNT(*) FILTER (WHERE status='dispatched' AND paid_in_range)::int AS in_transit,
      COALESCE(SUM(total-COALESCE(paypal_fee,0)) FILTER (WHERE status=ANY(${REPORT_PAID_STATUSES}::text[]) AND paid_in_range),0) AS revenue
    FROM dated
  `;
  return {totalOrders:Number(row.total_orders),awaitingPayment:Number(row.awaiting_payment),awaitingDispatch:Number(row.awaiting_dispatch),
    inTransit:Number(row.in_transit),revenue:Number(row.revenue)};
}
