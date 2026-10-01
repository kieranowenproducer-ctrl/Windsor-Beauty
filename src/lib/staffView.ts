// Staff view + "preview as customer" (two flavours).
//
// The middleware sets a non-httpOnly `wg_ui_session=staff` cookie for signed-in
// admins; the storefront uses it to show admin-only chrome (stock editors, price
// editors, the Admin nav link). That same cookie also reads as "a logged-in
// member" for pricing, so a plain preview shows the member price.
//
// An admin can preview the storefront in one of two customer modes without
// logging out, chosen via the `wg_view_as` cookie:
//   'member' — a logged-in member (member pricing, no signup pitch)
//   'guest'  — a not-logged-in visitor (non-member pricing, signup pitch,
//              discount popup) — a full "logged out" simulation
// Absent/anything else = normal admin view. The real admin session (httpOnly
// wg_admin_session) is never touched, so nothing about the login changes.

export type PreviewMode = 'admin' | 'member' | 'guest';

const PREVIEW_COOKIE = 'wg_view_as';
const LEGACY_COOKIE = 'wg_view_as_customer'; // superseded by wg_view_as

function has(name: string, value: string): boolean {
  if (typeof document === 'undefined') return false;
  return document.cookie.split('; ').some((c) => c === `${name}=${value}`);
}
function cookieValue(name: string): string {
  if (typeof document === 'undefined') return '';
  const row = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
  return row ? row.slice(name.length + 1) : '';
}

/** Signed-in admin, regardless of preview mode (used to show the toggle itself). */
export function hasStaffSession(): boolean {
  return has('wg_ui_session', 'staff');
}

/** The admin's chosen customer-preview mode (only meaningful for admins). */
export function getPreviewMode(): PreviewMode {
  const v = cookieValue(PREVIEW_COOKIE);
  if (v === 'member' || v === 'guest') return v;
  return 'admin';
}

/** Whether to render admin-only UI: signed-in admin AND in normal admin view. */
export function isStaffView(): boolean {
  return hasStaffSession() && getPreviewMode() === 'admin';
}

/**
 * Whether the storefront should treat the visitor as a logged-in member
 * (member pricing, no signup pitch, no discount popup).
 *  - Real (non-admin) visitors: their actual member/staff hint cookie.
 *  - Admin previewing: 'admin' and 'member' modes are members; 'guest' is not.
 */
export function isMemberView(): boolean {
  const memberCookie = has('wg_ui_session', 'member') || has('wg_ui_session', 'staff');
  if (hasStaffSession()) return getPreviewMode() !== 'guest';
  return memberCookie;
}

/** Currently previewing the storefront as a customer (either mode). */
export function isViewingAsCustomer(): boolean {
  return hasStaffSession() && getPreviewMode() !== 'admin';
}

/** Switch preview mode. 'admin' clears it (back to the admin view). Persists ~8h. */
export function setPreviewMode(mode: PreviewMode): void {
  const on = mode === 'member' || mode === 'guest';
  document.cookie = `${PREVIEW_COOKIE}=${on ? mode : ''};path=/;max-age=${on ? 60 * 60 * 8 : 0};samesite=lax`;
  // Clear any cookie left by the previous single-mode implementation.
  document.cookie = `${LEGACY_COOKIE}=;path=/;max-age=0;samesite=lax`;
}
