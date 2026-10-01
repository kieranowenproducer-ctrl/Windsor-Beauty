// Whether members can see the "More detail from the approved sources"
// passage layer (Pearl plan Stage D step 7).
//
// The passage search reads the stored source library in the database and
// shows cited extracts UNDER the fixed template answer. The template spine is
// never changed by it. Following the same pattern as the concierge switches
// (src/lib/concierge/availability.ts): reachability is a server decision, the
// default is OFF, and a missing or mistyped value keeps it off.
//
// Admin surfaces do not check this switch — the admin bench shows passages
// first so they can be judged before any member sees them. When Kieran turns
// this on, the member-facing surface must ALSO exist and pass its review;
// the switch alone does not create one.

export function pearlPassagesOpenToMembers(): boolean {
  return (process.env.PEARL_PASSAGES_LIVE ?? 'off').trim().toLowerCase() === 'on';
}
