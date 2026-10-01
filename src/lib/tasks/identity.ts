// Member identity for the task module. The Windsor Glow admin panel uses ONE
// shared admin login (ADMIN_SESSION_TOKEN), so tasks keep their own lightweight
// per-person identity: after admin login, each person picks who they are once
// and gets an HMAC-signed cookie. That identity drives assignments, comments,
// audit history and notifications. Signing reuses ADMIN_SESSION_TOKEN as key
// material (no new secret; rotating the admin token re-prompts the picker).
import { createHmac, timingSafeEqual } from 'crypto';
import { cookies } from 'next/headers';
import { tsql, getWorkspace, type Member } from './db';

export const MEMBER_COOKIE = 'wg_tasks_member';

function key(): string {
  const k = process.env.ADMIN_SESSION_TOKEN;
  if (!k) throw new Error('ADMIN_SESSION_TOKEN missing');
  return k;
}

export function signMemberId(memberId: string): string {
  const mac = createHmac('sha256', key()).update(memberId).digest('base64url');
  return `${memberId}.${mac}`;
}

export function verifyMemberCookie(value: string | undefined): string | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot < 1) return null;
  const id = value.slice(0, dot);
  const mac = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(createHmac('sha256', key()).update(id).digest('base64url'));
  if (mac.length !== expected.length || !timingSafeEqual(mac, expected)) return null;
  return id;
}

/** The signed-in task member for this request, or null (UI then shows the picker). */
export async function getMember(): Promise<Member | null> {
  const id = verifyMemberCookie((await cookies()).get(MEMBER_COOKIE)?.value);
  if (!id) return null;
  const ws = await getWorkspace();
  if (!ws) return null;
  const rows = await tsql()`
    SELECT m.id, m.user_id, u.name, u.email, m.role
    FROM workspace_members m JOIN task_users u ON u.id = m.user_id
    WHERE m.id = ${id} AND m.workspace_id = ${ws.id}` as Member[];
  return rows[0] ?? null;
}
