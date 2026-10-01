// Admin AI Support Inbox API (Stage 4b). Admin-cookie gated by middleware.
// GET  — open support cases + pending actions the AI queued for approval.
// POST — a human decides: approve / reject a pending action, or resolve a case.
// Reads/writes the isolated aisupport DB (never the store DB). Approving a
// pending action is the human-executed T3 step: this records the decision and
// a real refund/cancel is then carried out in the normal admin tools. The AI
// never performs it; it only ever queued the request.
import { NextResponse } from 'next/server';
import { neon } from '@neondatabase/serverless';
import { findOrderByNumber, updateOrderStatus, updateOrderShippingAddress, type OrderAddressUpdate } from '@/lib/db';
import { reverseGlowCardOrderPoints } from '@/lib/glowCardLoyalty';

export const dynamic = 'force-dynamic';

const TENANT = 'windsor-glow';
// Statuses at which an order can still be cancelled / re-addressed (mirrors the
// engine's gate). Re-checked here at approval time in case the order moved on
// between the customer's request and the human's approval.
const CHANGEABLE_STATUSES = ['pending', 'awaiting_payment', 'paid', 'awaiting_dispatch', 'processing'];

interface PendingActionRow { id: string; action: string; details: { newAddress?: OrderAddressUpdate; reason?: string } | null; order_number: string | null }

// Execute the real store write for an approved action. The AI never reaches
// this — only a human approval does. Returns a human-readable outcome.
async function executeApproved(a: PendingActionRow): Promise<string> {
  const orderNumber = a.order_number ?? '';
  if (a.action === 'refund') {
    // No automatic store write: a real payment refund is done in the payment
    // provider, then the order marked refunded via the normal order tools.
    return 'Approved. Process the refund in the payment provider, then mark the order refunded.';
  }
  const order = orderNumber ? await findOrderByNumber(orderNumber).catch(() => null) : null;
  if (!order) return 'Approved, but the order could not be found to apply the change. Please handle manually.';
  if (!CHANGEABLE_STATUSES.includes(String(order.status))) {
    return `Approved, but order ${orderNumber} is now "${order.status}" and can no longer be changed automatically. Please handle manually.`;
  }
  if (a.action === 'cancellation') {
    const cancelled = await updateOrderStatus(orderNumber, 'cancelled');
    if (cancelled) await reverseGlowCardOrderPoints(cancelled).catch(() => {});
    return `Order ${orderNumber} cancelled.`;
  }
  if (a.action === 'address_change' && a.details?.newAddress) {
    await updateOrderShippingAddress(orderNumber, a.details.newAddress);
    return `Delivery address updated on order ${orderNumber}.`;
  }
  return 'Approved.';
}
function db() {
  const url = process.env.AISUPPORT_DATABASE_URL;
  if (!url) throw new Error('AISUPPORT_DATABASE_URL not set');
  return neon(url);
}

export async function GET() {
  if (!process.env.AISUPPORT_DATABASE_URL) {
    return NextResponse.json({ ok: false, error: 'Support DB not configured.' }, { status: 503 });
  }
  try {
    const sql = db();
    const cases = await sql`SELECT id, kind, summary, contact_email, order_number, status, created_at
      FROM support_cases WHERE tenant_id = ${TENANT} AND status = 'open' ORDER BY created_at DESC LIMIT 200`;
    const actions = await sql`SELECT id, action, details, order_number, contact_email, status, created_at
      FROM pending_actions WHERE tenant_id = ${TENANT} AND status = 'pending' ORDER BY created_at DESC LIMIT 200`;
    const [{ oc }] = (await sql`SELECT count(*)::int oc FROM support_cases WHERE tenant_id=${TENANT} AND status='open'`) as { oc: number }[];
    const [{ pc }] = (await sql`SELECT count(*)::int pc FROM pending_actions WHERE tenant_id=${TENANT} AND status='pending'`) as { pc: number }[];
    return NextResponse.json({ ok: true, cases, actions, counts: { openCases: oc, pendingActions: pc } });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const b = await request.json().catch(() => ({}));
  const type = b.type as string; // 'case' | 'action'
  const id = String(b.id ?? '');
  const decision = b.decision as string; // 'approve' | 'reject' | 'resolve'
  const by = String(b.by ?? 'admin').slice(0, 80);
  if (!id || !type) return NextResponse.json({ ok: false, error: 'id and type required' }, { status: 400 });
  try {
    const sql = db();
    if (type === 'case') {
      const status = decision === 'reject' ? 'dismissed' : 'resolved';
      await sql`UPDATE support_cases SET status = ${status} WHERE id = ${id} AND tenant_id = ${TENANT}`;
      await sql`INSERT INTO action_audit (tenant_id, action, tier, detail, result)
        VALUES (${TENANT}, 'case_decision', 'human', ${JSON.stringify({ id, decision, by })}::jsonb, ${status})`;
      return NextResponse.json({ ok: true, status });
    }
    if (type === 'action') {
      const status = decision === 'approve' ? 'approved' : 'rejected';
      // load the action first so we can execute the real store write on approval
      const [row] = (await sql`SELECT id, action, details, order_number FROM pending_actions
        WHERE id = ${id} AND tenant_id = ${TENANT} AND status = 'pending'`) as PendingActionRow[];
      if (!row) return NextResponse.json({ ok: false, error: 'Action not found or already decided.' }, { status: 404 });
      let outcome = 'Rejected.';
      if (decision === 'approve') outcome = await executeApproved(row);
      await sql`UPDATE pending_actions SET status = ${status}, decided_by = ${by}, decided_at = now()
        WHERE id = ${id} AND tenant_id = ${TENANT}`;
      await sql`INSERT INTO action_audit (tenant_id, action, tier, detail, result)
        VALUES (${TENANT}, 'action_decision', 'human', ${JSON.stringify({ id, decision, by, outcome })}::jsonb, ${status})`;
      return NextResponse.json({ ok: true, status, outcome });
    }
    return NextResponse.json({ ok: false, error: 'unknown type' }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : 'error' }, { status: 500 });
  }
}
