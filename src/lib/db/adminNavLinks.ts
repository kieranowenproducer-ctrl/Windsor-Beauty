import { requireDb } from './client';
// Extracted verbatim from db.ts on 2026-08-11 (Phase 2 of "thin it out").
// Everything here is re-exported from '@/lib/db', so no call site changed.

// ─── Admin sidebar custom links ──────────────────────────────────────────────
// Additive-only extra nav entries an admin can add themselves from
// /admin/nav-links, rendered in their own group after the built-in ones.

export interface AdminNavLinkRow {
  id: number;
  label: string;
  href: string;
  sort_order: number;
}

export async function listAdminNavLinks(): Promise<AdminNavLinkRow[]> {
  const db = requireDb();
  const rows = await db`SELECT id, label, href, sort_order FROM admin_nav_links ORDER BY sort_order ASC, id ASC`;
  return rows as AdminNavLinkRow[];
}

export async function createAdminNavLink(label: string, href: string): Promise<AdminNavLinkRow> {
  const db = requireDb();
  const [{ next }] = await db`SELECT COALESCE(MAX(sort_order), -1) + 1 AS next FROM admin_nav_links`;
  const [row] = await db`
    INSERT INTO admin_nav_links (label, href, sort_order)
    VALUES (${label}, ${href}, ${next as number})
    RETURNING id, label, href, sort_order
  `;
  return row as AdminNavLinkRow;
}

export async function updateAdminNavLink(id: number, label: string, href: string): Promise<void> {
  const db = requireDb();
  await db`UPDATE admin_nav_links SET label = ${label}, href = ${href} WHERE id = ${id}`;
}

export async function deleteAdminNavLink(id: number): Promise<void> {
  const db = requireDb();
  await db`DELETE FROM admin_nav_links WHERE id = ${id}`;
}

// Body is the full, newly-ordered list of ids — simplest correct way to
// persist a drag/up-down reorder without diffing positions client-side.
export async function setAdminNavLinkOrder(ids: number[]): Promise<void> {
  const db = requireDb();
  for (let i = 0; i < ids.length; i++) {
    await db`UPDATE admin_nav_links SET sort_order = ${i} WHERE id = ${ids[i]}`;
  }
}
