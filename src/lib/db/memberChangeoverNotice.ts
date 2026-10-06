import { requireDb } from './client';
import { MEMBER_CHANGEOVER_CAMPAIGN, MEMBER_CHANGEOVER_CONTENT_HASH, type NoticeMember } from '@/lib/email/memberChangeoverNotice';

// Installer is separate and explicitly approved. No runtime DDL or consent synchronisation.
export async function findMemberChangeoverRecipient(id: number): Promise<NoticeMember | null> {
  const rows = await requireDb()`SELECT c.id,c.email,c.membership_status,c.marketing_consent,
    c.email_verified,c.account_status,c.banned_at,
    (SELECT count(*)::integer FROM marketing_contacts m WHERE lower(m.email)=lower(c.email)) AS contact_matches,
    m.consent AS contact_consent,m.unsubscribed_at,m.unsubscribe_token,
    EXISTS(SELECT 1 FROM customer_emails ce WHERE lower(ce.email)=lower(c.email)
      AND ce.delivery_status IN ('bounced','complained','suppressed','failed')) AS locally_suppressed
    FROM customers c LEFT JOIN marketing_contacts m ON lower(m.email)=lower(c.email)
    WHERE c.id=${id}`;
  return rows.length === 1 ? rows[0] as NoticeMember : null;
}

export async function memberChangeoverReviewRows(): Promise<(NoticeMember & { already_reserved: boolean })[]> {
  const rows = await requireDb()`SELECT c.id,c.email,c.membership_status,c.marketing_consent,
    c.email_verified,c.account_status,c.banned_at,
    (SELECT count(*)::integer FROM marketing_contacts m WHERE lower(m.email)=lower(c.email)) AS contact_matches,
    m.consent AS contact_consent,m.unsubscribed_at,m.unsubscribe_token,
    EXISTS(SELECT 1 FROM customer_emails ce WHERE lower(ce.email)=lower(c.email)
      AND ce.delivery_status IN ('bounced','complained','suppressed','failed')) AS locally_suppressed,
    EXISTS(SELECT 1 FROM beauty_member_changeover_deliveries d WHERE d.campaign_key=${MEMBER_CHANGEOVER_CAMPAIGN}
      AND (d.customer_id=c.id OR d.recipient_email=lower(trim(c.email)))) AS already_reserved
    FROM customers c LEFT JOIN marketing_contacts m ON lower(m.email)=lower(c.email)
    WHERE c.membership_status='member' ORDER BY c.id LIMIT 501`;
  if (rows.length > 500) throw new Error('Member notice audience requires separate bounded review.');
  return rows as (NoticeMember & { already_reserved: boolean })[];
}

export async function reserveMemberChangeover(member: NoticeMember, evidenceHash: string, idempotencyKey: string): Promise<boolean> {
  const rows = await requireDb()`INSERT INTO beauty_member_changeover_deliveries
    (campaign_key,customer_id,recipient_email,content_hash,suppression_evidence_hash,idempotency_key)
    SELECT ${MEMBER_CHANGEOVER_CAMPAIGN},c.id,lower(trim(c.email)),${MEMBER_CHANGEOVER_CONTENT_HASH},${evidenceHash},${idempotencyKey}
    FROM customers c WHERE c.id=${member.id} AND lower(trim(c.email))=${member.email.trim().toLowerCase()}
      AND c.membership_status='member'
      AND c.email_verified AND c.account_status='active' AND c.banned_at IS NULL AND c.marketing_consent
      AND (SELECT count(*) FROM marketing_contacts m WHERE lower(m.email)=lower(c.email))=1
      AND EXISTS(SELECT 1 FROM marketing_contacts m WHERE lower(m.email)=lower(c.email) AND m.consent
        AND m.unsubscribed_at IS NULL AND m.unsubscribe_token=${member.unsubscribe_token})
      AND NOT EXISTS(SELECT 1 FROM customer_emails ce WHERE lower(ce.email)=lower(c.email)
        AND ce.delivery_status IN ('bounced','complained','suppressed','failed'))
    ON CONFLICT DO NOTHING RETURNING customer_id`;
  return rows.length === 1;
}

export async function claimMemberChangeover(member: NoticeMember): Promise<boolean> {
  const rows = await requireDb()`UPDATE beauty_member_changeover_deliveries d SET state='sending',updated_at=now()
    WHERE d.campaign_key=${MEMBER_CHANGEOVER_CAMPAIGN} AND d.customer_id=${member.id} AND d.state='reserved'
      AND d.content_hash=${MEMBER_CHANGEOVER_CONTENT_HASH} AND d.recipient_email=${member.email.trim().toLowerCase()}
      AND (SELECT count(*) FROM marketing_contacts m WHERE lower(m.email)=d.recipient_email)=1
      AND EXISTS(SELECT 1 FROM customers c JOIN marketing_contacts m ON lower(m.email)=lower(c.email)
        WHERE c.id=d.customer_id AND lower(trim(c.email))=d.recipient_email AND c.marketing_consent
          AND c.membership_status='member'
          AND c.email_verified AND c.account_status='active' AND c.banned_at IS NULL
          AND m.consent AND m.unsubscribed_at IS NULL AND m.unsubscribe_token=${member.unsubscribe_token})
      AND NOT EXISTS(SELECT 1 FROM customer_emails ce WHERE lower(ce.email)=d.recipient_email
        AND ce.delivery_status IN ('bounced','complained','suppressed','failed'))
    RETURNING customer_id`;
  return rows.length === 1;
}

export async function finishMemberChangeover(id: number, state: 'sent' | 'held', providerId: string | null): Promise<void> {
  const rows = await requireDb()`UPDATE beauty_member_changeover_deliveries SET state=${state},provider_id=${providerId},updated_at=now()
    WHERE campaign_key=${MEMBER_CHANGEOVER_CAMPAIGN} AND customer_id=${id} AND state IN ('reserved','sending')
    RETURNING customer_id`;
  if (rows.length !== 1) throw new Error('Member notice outcome needs reconciliation.');
}
