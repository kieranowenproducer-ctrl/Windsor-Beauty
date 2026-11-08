import { requireDb } from './client';
import { ACTIVITY_OUTSTANDING, encodeReportCursor, type ReportCursor } from '@/lib/adminReportPaging';

// SELECT only. Each source is paged together so busy recent activity cannot hide
// older unpaid/unposted orders or unresolved failures. No history is deleted.
export async function readAdminActivity(cursor: ReportCursor | null) {
  const db = requireDb();
  const rows = await db`
    WITH feed AS (
      SELECT 'order-' || o.id AS key,
        CASE WHEN o.status = ANY(${ACTIVITY_OUTSTANDING}::text[]) THEN 1 ELSE 0 END AS priority,
        COALESCE(o.payment_confirmed_at, o.created_at) AS at,
        jsonb_build_object('type','order','at',COALESCE(o.payment_confirmed_at,o.created_at),
          'paymentConfirmedAt',o.payment_confirmed_at,'orderNumber',o.order_number,
          'customerName',o.customer_name,'email',o.email,'customerId',o.customer_id,
          'total',o.total::text,'status',o.status,'clearable',o.status IN ('cancelled','payment_failed'),
          'itemCount',jsonb_array_length(COALESCE(o.items,'[]'::jsonb)),
          'items',COALESCE((SELECT jsonb_agg(it.value) FROM jsonb_array_elements(COALESCE(o.items,'[]'::jsonb)) WITH ORDINALITY AS it(value,n) WHERE n <= 6),'[]'::jsonb),
          'paymentMethod',o.payment_method,'trackingNumber',o.tracking_number,'trackingUrl',o.tracking_url,
          'royalMailLabelStatus',o.royal_mail_label_status,'fulfilmentType',o.fulfilment_type) AS event
      FROM orders o
      WHERE o.activity_cleared_at IS NULL OR o.status IN ('paid','awaiting_dispatch','processing','exported')
      UNION ALL
      SELECT 'customer-' || c.id,0,c.created_at,
        jsonb_build_object('type','customer','at',c.created_at,'customerId',c.id,
          'name',COALESCE(NULLIF(trim(concat_ws(' ',c.first_name,c.last_name)),''),c.email),
          'email',c.email,'phone',c.phone,'emailVerified',c.email_verified,'marketingConsent',c.marketing_consent)
      FROM customers c
      UNION ALL
      SELECT 'issue-' || f.id,1,f.created_at,
        jsonb_build_object('type','issue','at',f.created_at,'id',f.id,'category',f.category,'message',f.message,'orderNumber',f.order_number)
      FROM automation_failures f WHERE f.resolved_at IS NULL
    )
    SELECT key, priority, at, event,
      to_char(at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at FROM feed
    WHERE (${cursor?.at ?? null}::timestamptz IS NULL
      OR (priority,at,key) < (${cursor?.priority ?? 0}::int,${cursor?.at ?? null}::timestamptz,${cursor?.key ?? ''}::text))
    ORDER BY priority DESC, at DESC, key DESC LIMIT 51
  `;
  const page = rows.slice(0, 50);
  const last = page.at(-1);
  return {
    events: page.map(row => row.event),
    nextCursor: rows.length > 50 && last ? encodeReportCursor({ priority: Number(last.priority), at: last.cursor_at, key: last.key }) : null,
  };
}
