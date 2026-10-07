'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [token, setToken] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Read the token from the URL directly rather than via useSearchParams —
  // avoids the Suspense-boundary requirement that hook imposes for a value
  // we only need once, on mount.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    setToken(params.get('token'));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (password.length < 8) {
      setError('Your new password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Your passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/account/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.redirect) {
        router.push(data.redirect);
        router.refresh();
      } else {
        setError(data?.error || 'We could not reset your password. Please request a new link and try again.');
      }
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors';
  const labelClass = 'block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5';

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Windsor Beauty</p>
          <h1 className="font-serif text-3xl text-stone-800 tracking-wide">Set a New Password</h1>
          <p className="text-xs text-stone-500 mt-2 leading-relaxed">
            Choose a new password for your account. You will be signed in automatically once it is set.
          </p>
        </div>

        <div className="beauty-form-panel p-6 sm:p-8">
          {token === null ? (
            <p className="text-xs text-stone-500 text-center">Checking your link…</p>
          ) : token === '' ? (
            <div className="text-center">
              <p className="text-sm text-stone-600 leading-relaxed">
                This password reset link is missing or invalid.
              </p>
              <Link
                href="/account/forgot-password"
                className="inline-block mt-4 text-[9px] tracking-[0.2em] uppercase text-gold-700 hover:text-gold-800 font-medium"
              >
                Request a new link
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className={labelClass}>New Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={inputClass}
                />
                <p className="text-[9px] text-stone-500 mt-1">At least 8 characters.</p>
              </div>
              <div>
                <label className={labelClass}>Confirm New Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={e => setConfirmPassword(e.target.value)}
                  required
                  autoComplete="new-password"
                  className={inputClass}
                />
              </div>

              {error && (
                <div>
                  <p className="text-xs text-red-500">{error}</p>
                  {error.toLowerCase().includes('expired') || error.toLowerCase().includes('invalid') ? (
                    <Link
                      href="/account/forgot-password"
                      className="inline-block mt-2 text-[9px] tracking-[0.2em] uppercase text-gold-700 hover:text-gold-800 font-medium"
                    >
                      Request a new link
                    </Link>
                  ) : null}
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors disabled:bg-stone-200 disabled:text-stone-400 mt-2"
              >
                {loading ? 'Saving…' : 'Set New Password'}
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
