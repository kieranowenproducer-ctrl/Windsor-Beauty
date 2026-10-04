import Link from 'next/link';

export default function CreatePasswordPage() {
  return <main className="max-w-md mx-auto px-4 py-16">
    <h1 className="font-serif text-3xl text-stone-800 mb-4">Finish your account safely</h1>
    <p className="text-sm text-stone-600 mb-6">Request a secure link at your email address first. After setting your password, complete the member registration form. Use your original invitation link if you were invited.</p>
    <Link href="/account/forgot-password" className="block bg-gold-700 text-white text-center px-4 py-3">Email me a secure link</Link>
    <Link href="/account/register" className="block text-gold-700 underline mt-4">Complete member registration</Link>
  </main>;
}
