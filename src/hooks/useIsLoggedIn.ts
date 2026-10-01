'use client';

import { useEffect, useState } from 'react';

/**
 * Returns null while the check is in flight, then true/false once
 * /api/account/me has responded (200 = signed in, 401 = guest).
 */
export function useIsLoggedIn(): boolean | null {
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/account/me')
      .then(res => {
        if (!cancelled) setIsLoggedIn(res.status === 200);
      })
      .catch(() => {
        if (!cancelled) setIsLoggedIn(false);
      });
    return () => { cancelled = true; };
  }, []);

  return isLoggedIn;
}
