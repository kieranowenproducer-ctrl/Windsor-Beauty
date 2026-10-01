'use client';

// Shows an email exactly as the customer received it (task ce308493).
//
// Kieran, 19 September 2026: "if I want to press a button next to it, I can see the email sent to
// the customer."
//
// THE FORMATTED EMAIL IS SHOWN IN AN IFRAME, and that is the whole point of the component rather
// than a div. An email body is a full HTML document written for email clients: dropped into the
// admin page directly it would inherit the admin's own styles, look nothing like what was sent, and
// its own styles would leak back out and affect the page around it. `sandbox` with nothing enabled
// also means the saved markup cannot run anything.
//
// It falls back to the plain-text version for older emails, which were saved before the formatted
// half was kept, and says so rather than showing an empty white box.

interface Props {
  subject: string;
  html: string | null;
  text: string;
  onClose: () => void;
}

export default function SentEmailViewer({ subject, html, text, onClose }: Props) {
  return (
    <div
      className="fixed inset-0 z-50 bg-stone-900/50 flex items-start justify-center p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="bg-white w-full max-w-3xl my-8 shadow-lift"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-stone-100 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <p className="text-[9px] tracking-[0.18em] uppercase text-stone-500 mb-1">
              The email as the customer received it
            </p>
            <p className="text-sm font-semibold text-stone-800 break-words">{subject || '(no subject)'}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 border border-stone-300 text-stone-600 text-[9px] tracking-[0.14em] uppercase px-4 py-2 hover:border-stone-400 transition-colors"
          >
            Close
          </button>
        </div>

        {html ? (
          <iframe
            title="The email that was sent"
            sandbox=""
            srcDoc={html}
            className="w-full h-[70vh] border-0 bg-white"
          />
        ) : (
          <div className="px-5 py-4">
            <p className="text-[10px] text-stone-500 mb-3">
              This one was saved before we started keeping the formatted version, so this is the
              plain-text wording of it.
            </p>
            <pre className="text-[11px] text-stone-700 whitespace-pre-wrap font-sans">{text || '(nothing was saved)'}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
