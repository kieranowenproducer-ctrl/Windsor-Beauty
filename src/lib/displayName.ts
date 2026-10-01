// Truncates a full name to "First L" for display on the public reviews page,
// e.g. "Kieran Jones" -> "Kieran J". Single-word names pass through unchanged.
export function truncateDisplayName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length < 2) return parts[0] ?? '';
  const first = parts[0];
  const lastInitial = parts[parts.length - 1][0];
  return `${first} ${lastInitial}`;
}
