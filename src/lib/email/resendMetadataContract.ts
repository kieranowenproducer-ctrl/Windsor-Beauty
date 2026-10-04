// Resend added the real SMTP Message-ID to all email.* webhook events and
// GET /emails/:email_id in July 2026. API UUID and SMTP ID remain distinct.
// https://resend.com/changelog/message-id-for-sent-emails
// https://resend.com/docs/api-reference/emails/retrieve-email
export interface ResendOutgoingMessageMetadata {
  email_id: string;
  message_id: string;
  from: string;
  to: string[];
  reply_to?: string[];
}

// Raw JSON still needs validation; optional fields here represent malformed or
// historical events, never permission to guess a missing SMTP identifier.
export interface ParsedResendOutboundWebhook {
  type?: string;
  created_at?: string;
  data?: Partial<ResendOutgoingMessageMetadata>;
}
