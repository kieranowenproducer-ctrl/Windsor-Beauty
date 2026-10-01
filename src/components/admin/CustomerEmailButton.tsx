'use client';

import { useState } from 'react';
import { DEFAULT_ADMIN_SENDER, type AdminSenderKey } from '@/lib/email/adminSenders';
import CustomerEmailComposer from './CustomerEmailComposer';

// Task bc9b6309. Kieran's words, watching his own Orders screen: "anytime I see an email address
// I should be able to click it, another box should come up and I should be able to type it".
//
// So the email address itself IS the control. Drop this in wherever an address is printed and
// that address becomes clickable, opening a message box with a sender dropdown.
//
// The dialog itself lives in CustomerEmailComposer.tsx since task 72260d57
// (drafts + the iPhone scrolling fix), shared with the customer page's Email
// History. The typed text lives HERE, so closing the box by accident never
// loses the message — only a successful send clears it (the composer does
// that through the setters).
//
// Two things this has to get right, both learned the hard way in this codebase:
//   - It usually sits inside a row that is itself clickable (selecting an order or a customer).
//     Every click and key press stops here, or opening the message box also changes what row is
//     selected underneath it.
//   - It is a <button>, not a <div> with an onClick. A dashboard used all day needs the address
//     reachable and pressable from the keyboard.

interface Props {
  email: string;
  /** Used for the greeting line and shown in the box so you can see who you are writing to. */
  customerName?: string | null;
  /** Matches the surrounding text so the address does not suddenly change size. */
  className?: string;
}

export default function CustomerEmailButton({ email, customerName, className = '' }: Props) {
  const [open, setOpen] = useState(false);
  const [sender, setSender] = useState<AdminSenderKey>(DEFAULT_ADMIN_SENDER);
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [draftId, setDraftId] = useState<number | null>(null);

  return (
    <>
      <button
        type="button"
        title={`Send ${customerName || email} a message`}
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setOpen(true); }}
        onKeyDown={(e) => e.stopPropagation()}
        className={`text-left underline decoration-dotted underline-offset-2 hover:text-gold-700 hover:decoration-solid focus-visible:text-gold-700 transition-colors cursor-pointer max-w-full truncate ${className}`}
      >
        {email}
      </button>

      {open && (
        <CustomerEmailComposer
          email={email}
          customerName={customerName}
          sender={sender}
          setSender={setSender}
          subject={subject}
          setSubject={setSubject}
          message={message}
          setMessage={setMessage}
          draftId={draftId}
          setDraftId={setDraftId}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}
