'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function CreatePasswordForm() {
  const searchParams = useSearchParams();

  const [email, setEmail] = useState(searchParams.get('email') || '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!firstName.trim() || !lastName.trim()) {
      setError('Please enter your first and last name.');
      return;
    }
    if (password.length < 8) {
      setError('Your password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Your passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/account/create-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          password,
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.ok && data?.redirect) {
        window.location.href = data.redirect;
        return;
      }
      setError(data?.error || 'We could not activate your account. Please try again.');
      setLoading(false);
    } catch {
      setError('Something went wrong. Please try again.');
      setLoading(false);
    }
  }

  const inputClass = 'w-full border border-stone-200 focus:border-gold-400 outline-none px-3 py-2.5 text-sm text-stone-700 bg-white transition-colors';
  const labelClass = 'block text-[9px] tracking-[0.2em] uppercase text-stone-500 mb-1.5';

  return (
    <div className="max-w-md mx-auto px-4 py-16">
      <div className="text-center mb-8">
        <p className="text-[9px] tracking-[0.38em] uppercase text-gold-700 mb-2">Windsor Beauty</p>
        <h1 className="font-serif text-3xl text-stone-800 tracking-wide">Activate Your Account</h1>
        <p className="text-xs text-stone-500 mt-2 leading-relaxed">
          You are already on our list. Set a password to finish setting up your member account.
        </p>
      </div>

      <div className="bg-white border border-gold-100 p-8">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={labelClass}>Email Address</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoComplete="email"
              className={inputClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>First Name</label>
              <input type="text" value={firstName} onChange={e => setFirstName(e.target.value)} required className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Last Name</label>
              <input type="text" value={lastName} onChange={e => setLastName(e.target.value)} required className={inputClass} />
            </div>
          </div>
          <div>
            <label className={labelClass}>Password</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} required autoComplete="new-password" className={inputClass} />
            <p className="text-[9px] text-stone-500 mt-1">At least 8 characters.</p>
          </div>
          <div>
            <label className={labelClass}>Confirm Password</label>
            <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} required autoComplete="new-password" className={inputClass} />
          </div>

          {error && <p className="text-xs text-red-500">{error}</p>}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gold-700 text-white text-[10px] tracking-[0.22em] uppercase py-3.5 hover:bg-gold-800 transition-colors disabled:bg-stone-200 disabled:text-stone-400 mt-2"
          >
            {loading ? 'Activating your account…' : 'Activate Account'}
          </button>
        </form>
      </div>

      <p className="text-center text-xs text-stone-500 mt-6">
        Already activated?{' '}
        <Link href="/account/login" className="text-gold-700 hover:text-gold-800 font-medium">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function CreatePasswordPage() {
  return (
    <Suspense>
      <CreatePasswordForm />
    </Suspense>
  );
}
