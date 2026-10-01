'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch('/api/account/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok) {
        setSent(true);
      } else {
        setError(data?.error || 'Something went wrong. Please try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors';

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Windsor Glow</p>
          <h1 className="font-serif text-3xl text-stone-800 tracking-wide">Reset Password</h1>
          <p className="text-xs text-stone-500 mt-2 leading-relaxed">
            Enter the email address on your account and we will send you a link to reset your password.
          </p>
        </div>

        <div className="bg-white border border-gold-100 p-8">
          {sent ? (
            <div className="text-center">
              <p className="text-sm text-stone-600 leading-relaxed">
                If an account exists for <span className="font-medium text-stone-800">{email}</span>, we have sent a link to reset your password. The link will expire in one hour.
              </p>
              <p className="text-xs text-stone-500 mt-4 leading-relaxed">
                Don&rsquo;t see it? Check your spam folder, or try again with a different email address.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                  autoComplete="email"
                  className={inputClass}
                />
              </div>

              {error && <p className="text-xs text-red-500">{error}</p>}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors disabled:bg-stone-200 disabled:text-stone-400 mt-2"
              >
                {loading ? 'Sending…' : 'Send Reset Link'}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-stone-500 mt-6">
          Remembered your password?{' '}
          <Link href="/account/login" className="text-gold-700 hover:text-gold-800 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
