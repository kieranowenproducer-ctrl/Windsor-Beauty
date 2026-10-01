/*
 * PEARL's dosage facts arrived through three generations of data: the original
 * sourceDose ranges, reviewed priority records, and source-library claims.
 * This module is the single read path for all three. It deliberately does not
 * decide which source is "good enough" to exist. Provenance travels with every
 * row so the answer can explain whether it came from an official label, a
 * paper, Windsor Glow, or a commercial/community source.
 */

const EMPTY_RANGE = /no preferred .+ range has been established|not stated|unknown/i;

function hasNumber(value) {
  return /\d/.test(String(value || ""));
}

function usefulRange(value) {
  return hasNumber(value) && !EMPTY_RANGE.test(String(value || ""));
}

function normaliseProtocol(protocol, fallback = {}) {
  const dose = String(protocol?.dose || fallback.dose || "").trim();
  if (!usefulRange(dose)) return null;
  return {
    label: String(protocol?.label || fallback.label || "Source-listed range").trim(),
    dose,
    frequency: String(protocol?.frequency || fallback.frequency || "Not stated").trim(),
    duration: String(protocol?.duration || fallback.duration || "Not stated").trim(),
    route: String(protocol?.route || fallback.route || "Not stated").trim(),
    population: String(protocol?.population || fallback.population || "Not stated").trim(),
    species: String(protocol?.species || fallback.species || "Not stated").trim(),
    evidenceType: String(protocol?.evidenceType || fallback.evidenceType || "Source-listed record").trim(),
    sourceId: String(protocol?.sourceId || fallback.sourceId || "unknown-source").trim(),
    sourceUrl: String(protocol?.sourceUrl || fallback.sourceUrl || "").trim(),
    provenance: String(protocol?.provenance || fallback.provenance || "supplied-source").trim(),
  };
}

function legacyProtocols(compound) {
  const range = compound?.sourceDose || {};
  const definitions = [
    ["Lower source range", range.low],
    ["Standard source range", range.standard],
    ["Higher source range", range.high],
  ];
  return definitions.map(([label, dose]) => normaliseProtocol({ label, dose }, {
    sourceId: "pearl-baseline",
    evidenceType: "Original supplied PEARL reference record",
    provenance: "legacy-supplied-source",
  })).filter(Boolean);
}

function protocolKey(protocol) {
  return [protocol.dose, protocol.frequency, protocol.route, protocol.species]
    .map((value) => String(value || "").toLowerCase().replace(/\s+/g, " ").trim())
    .join("|");
}

export function compileProtocols(compound, priorityRecord = null) {
  const priority = (priorityRecord?.protocols || []).map((protocol) => normaliseProtocol(protocol, {
    sourceId: "curated-dose-priority",
    provenance: "reviewed-priority",
  })).filter(Boolean);

  const supplied = (compound?.researchProfiles || [])
    .flatMap((profile) => profile.claims || [])
    .flatMap((claim) => (claim.protocols || []).map((protocol) => normaliseProtocol(protocol, {
      sourceId: claim.sourceId,
      sourceUrl: claim.url,
      evidenceType: "Supplied source protocol",
      provenance: "supplied-source",
    })))
    .filter(Boolean);

  const ordered = [...priority, ...supplied, ...legacyProtocols(compound)];
  return ordered.filter((protocol, index, all) =>
    all.findIndex((candidate) => protocolKey(candidate) === protocolKey(protocol)) === index,
  );
}

export function validateDoseAnswer(answer) {
  const rows = Array.isArray(answer?.dose) ? answer.dose : [];
  const numericRows = rows.filter((row) => hasNumber(row?.value));
  const errors = [];
  if (answer?.kind === "dose" && rows.length && !numericRows.length) errors.push("dose-without-numbers");
  if (answer?.kind === "dose" && numericRows.some((row) => !String(row.label || "").trim())) errors.push("unlabelled-dose-row");
  return { valid: errors.length === 0, numericRows: numericRows.length, errors };
}

export function knowledgeReceipt({ match, entityIds = [], protocols = [], answer = null }) {
  return {
    version: "pearl-knowledge-compiler-v1",
    match,
    entityIds,
    sourceIds: [...new Set(protocols.map((protocol) => protocol.sourceId).filter(Boolean))],
    validation: answer ? validateDoseAnswer(answer) : null,
  };
}
