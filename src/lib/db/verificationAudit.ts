import { requireDb } from './client';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── Verification audit log ──────────────────────────────────────────────────

export type VerificationAuditStatus =
  | 'verified'
  | 'failed_invalid_code'
  | 'failed_already_used'
  | 'failed_no_account'
  | 'failed_order_not_found'
  | 'failed_email_mismatch'
  | 'failed_format'
  | 'failed_error';

export interface VerificationAuditRow {
  id: number;
  code: string;
  product_name: string | null;
  order_number: string | null;
  customer_id: number | null;
  customer_name: string | null;
  customer_email: string | null;
  status: VerificationAuditStatus;
  failure_reason: string | null;
  is_repeat_attempt: boolean;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export async function logVerificationAuditEntry(params: {
  code: string;
  productName: string | null;
  orderNumber: string | null;
  customerId: number | null;
  customerName: string | null;
  customerEmail: string | null;
  status: VerificationAuditStatus;
  failureReason: string | null;
  isRepeatAttempt: boolean;
  ip: string | null;
  userAgent: string | null;
}): Promise<void> {
  const db = requireDb();
  await db`
    INSERT INTO verification_audit_log
      (code, product_name, order_number, customer_id, customer_name, customer_email,
       status, failure_reason, is_repeat_attempt, ip_address, user_agent)
    VALUES
      (${params.code}, ${params.productName}, ${params.orderNumber}, ${params.customerId},
       ${params.customerName}, ${params.customerEmail}, ${params.status}, ${params.failureReason},
       ${params.isRepeatAttempt}, ${params.ip}, ${params.userAgent})
  `;
}

export async function listVerificationAuditLog(limit = 200): Promise<VerificationAuditRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM verification_audit_log ORDER BY created_at DESC LIMIT ${limit}
  `;
  return rows as VerificationAuditRow[];
}

export async function getVerificationAuditForCustomer(customerId: number): Promise<VerificationAuditRow[]> {
  const db = requireDb();
  const rows = await db`
    SELECT * FROM verification_audit_log
    WHERE customer_id = ${customerId}
    ORDER BY created_at DESC
    LIMIT 50
  `;
  return rows as VerificationAuditRow[];
}
