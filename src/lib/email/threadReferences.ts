/** SMTP IDs are opaque and separate from provider API UUIDs. */
export function normaliseMessageId(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const id = trimmed.startsWith('<') && trimmed.endsWith('>') ? trimmed.slice(1, -1) : trimmed;
  return id.length <= 998 && /^[^\s<>@]+@[^\s<>@]+$/.test(id) ? id : null;
}

export function emailThreadReferences(headers?: Record<string, string>): string[] {
  const ids: string[] = [];
  for (const [name, raw] of Object.entries(headers || {})) {
    if (!['in-reply-to', 'references'].includes(name.toLowerCase())) continue;
    if (typeof raw !== 'string' || !raw.trim() || raw.length > 16000) throw new Error('Invalid email thread references.');
    const tokens = raw.match(/<[^<>]+>/g) || raw.split(/\s+/);
    if (raw.includes('<') && raw.replace(/<[^<>]+>/g, '').trim()) throw new Error('Ambiguous email thread references.');
    for (const token of tokens) {
      const id = normaliseMessageId(token);
      if (!id) throw new Error('Invalid email thread identifier.');
      if (!ids.includes(id)) ids.push(id);
    }
  }
  if (ids.length > 50) throw new Error('Too many email thread references.');
  return ids;
}

export function emailDirectParents(headers?: Record<string,string>):string[]{
  return emailThreadReferences(Object.fromEntries(Object.entries(headers||{}).filter(([name])=>name.toLowerCase()==='in-reply-to')));
}

export function exactBeautyThread<T extends { id: number; email: string; smtp_message_id: string; public_mailbox: string }>(sender: string, mailbox: string, references: string[], matches: T[], directParents: string[]=references): T | null {
  if (!references.length) return null;
  const rows = matches.filter(row => references.includes(row.smtp_message_id));
  if (references.some(id => !rows.some(row => row.smtp_message_id === id))) return null;
  const owned=new Set(['info','sales','accounts'].flatMap(local=>[`${local}@windsorbeauty.is`,`${local}@windsorbeauty.co.uk`]));
  owned.add('orders@windsorbeauty.is');owned.add('beautiful@windsorbeauty.is');
  if(rows.some(row=>row.email.trim().toLowerCase()!==sender||!owned.has(row.public_mailbox)))return null;
  if(!directParents.length || directParents.some(id=>!references.includes(id) || !rows.some(row=>row.smtp_message_id===id)) || rows.some(row=>directParents.includes(row.smtp_message_id)&&row.public_mailbox!==mailbox))return null;
  return new Set(rows.map(row => row.id)).size === 1 ? rows[0] : null;
}
