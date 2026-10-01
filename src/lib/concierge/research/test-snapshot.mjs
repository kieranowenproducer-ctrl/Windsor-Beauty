/**
 * The shape of a saved PEARL test result.
 *
 * A saved test does not try to mark free text right or wrong. It works like
 * the baseline picture: the first run records what PEARL answered, and every
 * later run says whether that answer is still the same. A human reads the
 * expected-outcome note and decides whether a changed answer is an
 * improvement (accept the new picture) or a break (fix it).
 *
 * Used by the admin run button (writes results) and by the local
 * `npm run pearl:tests` command (read only). Keeping the snapshot and the
 * comparison here means the two can never disagree about what "changed" means.
 */

/** The parts of an answer a member would notice changing. */
export function answerSnapshot(answer) {
  const interpretation = answer?.interpretation || {};
  const clean = (value, limit = 300) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, limit);
  return {
    kind: clean(answer?.kind, 40),
    title: clean(answer?.title, 200),
    summary: clean(answer?.summary),
    understood: clean(interpretation.status, 40),
    method: clean(interpretation.method, 60),
    compounds: [...new Set((answer?.compounds || []).map((name) => clean(name, 80)))].sort(),
    sections: (answer?.sections || []).map((section) => clean(section.title, 80)),
    bulletCount: (answer?.bullets || []).length,
    sourceCount: (answer?.sources || []).length,
  };
}

/** Human-readable list of what moved between two snapshots. Empty = same. */
export function snapshotDifferences(before, after) {
  if (!before) return [];
  const differences = [];
  const fields = [
    ['kind', 'answer type'],
    ['title', 'title'],
    ['summary', 'summary'],
    ['understood', 'understanding'],
    ['method', 'matching method'],
  ];
  for (const [key, label] of fields) {
    if (String(before[key] ?? '') !== String(after[key] ?? '')) {
      differences.push(`The ${label} changed from “${before[key] || 'nothing'}” to “${after[key] || 'nothing'}”.`);
    }
  }
  if ((before.compounds || []).join('|') !== (after.compounds || []).join('|')) {
    differences.push(`The compounds changed from [${(before.compounds || []).join(', ') || 'none'}] to [${(after.compounds || []).join(', ') || 'none'}].`);
  }
  if ((before.sections || []).join('|') !== (after.sections || []).join('|')) {
    differences.push(`The answer sections changed from [${(before.sections || []).join(', ') || 'none'}] to [${(after.sections || []).join(', ') || 'none'}].`);
  }
  if ((before.bulletCount ?? 0) !== (after.bulletCount ?? 0)) {
    differences.push(`The number of bullet points changed from ${before.bulletCount ?? 0} to ${after.bulletCount ?? 0}.`);
  }
  if ((before.sourceCount ?? 0) !== (after.sourceCount ?? 0)) {
    differences.push(`The number of sources shown changed from ${before.sourceCount ?? 0} to ${after.sourceCount ?? 0}.`);
  }
  return differences;
}

/** Parse a stored last_result column. Bad or old content just means "no picture yet". */
export function parseStoredResult(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === 'object' && parsed.snapshot ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Run one saved test against a fresh answer.
 * Returns { state, storedResult, differences }:
 *   'recorded'  first run — the picture was taken
 *   'pass'      the answer still matches the accepted picture
 *   'changed'   the answer moved — a person needs to look
 */
export function runSavedTest({ storedText, answer, checkedAt }) {
  const snapshot = answerSnapshot(answer);
  const prior = parseStoredResult(storedText);
  if (!prior) {
    return {
      state: 'recorded',
      differences: [],
      storedResult: { state: 'recorded', checkedAt, snapshot },
    };
  }
  const differences = snapshotDifferences(prior.snapshot, snapshot);
  if (!differences.length) {
    return {
      state: 'pass',
      differences: [],
      storedResult: { state: 'pass', checkedAt, snapshot, recordedAt: prior.recordedAt || prior.checkedAt },
    };
  }
  return {
    state: 'changed',
    differences,
    storedResult: {
      state: 'changed',
      checkedAt,
      snapshot,
      previous: prior.snapshot,
      differences,
      recordedAt: prior.recordedAt || prior.checkedAt,
    },
  };
}
