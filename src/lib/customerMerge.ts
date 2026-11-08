export type MergeCount = { table: string; count: number };
export type CustomerMergePreview = {
  keep: { id: number; email: string; name: string };
  remove: { id: number; email: string; name: string };
  moves: MergeCount[];
  revokes: MergeCount[];
  blockers: string[];
  token: string;
};

export const MERGE_LABELS: Record<string, string> = {
  orders: 'Orders', customer_emails: 'Email history', enquiries: 'Enquiries',
  reviews: 'Reviews', verification_audit_log: 'Verification history',
  marketing_contacts: 'Existing mailing-list records', research_chat_log: 'Chat history',
  site_visits: 'Site visits', site_interactions: 'Site activity',
  ip_activity_log: 'Connection history', member_login_log: 'Login history',
  customer_sessions: 'Sign-in sessions', email_verification_tokens: 'Email verification links',
  password_reset_tokens: 'Password reset links',
};
