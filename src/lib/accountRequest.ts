export class AccountRequestError extends Error {
  constructor(message: string, public code?: string, public redirect?: string) {
    super(message);
    this.name = 'AccountRequestError';
  }
}

/** A failed connection must not be presented as an incorrect password. */
export async function postAccountJson<T>(path: string, body: object, operation = 'Sign-in'): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    let response: Response;
    try {
      response = await fetch(path, { method: 'POST', credentials: 'same-origin', cache: 'no-store',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), signal: controller.signal });
    } catch {
      throw new AccountRequestError(controller.signal.aborted
        ? `${operation} took too long. Please try again.`
        : `We could not confirm ${operation.toLowerCase()}. Check your connection and try again.`);
    }
    const data = await response.json().catch(() => null);
    if (!data || typeof data !== 'object') throw new AccountRequestError(`${operation} is temporarily unavailable. Please try again.`);
    if (!response.ok) {
      const needsPassword = data.error === 'needsPassword';
      throw new AccountRequestError(typeof data.error === 'string' ? data.error : `${operation} is temporarily unavailable. Please try again.`,
        needsPassword ? 'needsPassword' : typeof data.code === 'string' ? data.code : undefined,
        needsPassword && typeof data.redirect === 'string' ? data.redirect : undefined);
    }
    return data as T;
  } finally { clearTimeout(timeout); }
}
