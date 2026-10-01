import type { Product } from '@/data/products';
import { reconstitutionTargetFor, ACETIC_ACID_SLUG, RECONSTITUTION_TARGET_SLUG } from '@/lib/upsells';
import { COMPOUNDS, PRODUCT_COMPOSITIONS, answerQuestion } from '@/lib/concierge/research/chat-engine.mjs';

/**
 * What PEARL holds on the dose of every product the shop sells (Kieran, 10 September 2026).
 *
 * "For all products ask Pearl what is recommended dosages protocol and see if Pearl finds them.
 *  List them in the same alphabetical order as they appear on the website. And list the sources as
 *  well. Also list whether the product needs bac water or AA water."
 *
 * Nothing here is written by hand and nothing is inferred. The dose, schedule, cycle and sources
 * are quoted from PEARL's own record; the water comes from reconstitutionTargetFor, which is the
 * single source of truth the product page, the basket and the CSV generator already read. A
 * product this cannot account for is reported as unaccounted for, never filled in from elsewhere.
 *
 * WHY THE MATCHING IS WRITTEN THE WAY IT IS, WHICH IS THE WHOLE ACCURACY OF THIS.
 * The first version asked PEARL a question built by tidying the product name, and called 11
 * products unknown. PEARL knew all but one of them. It files "CJC-1295" as "CJC-1295 (no DAC)" and
 * "HGH (191 AA )" as "HGH 191AA", and it documents the blend pens in a different record shape
 * entirely. A false "PEARL does not know this" is worse than no report: it sends somebody
 * researching what already exists. So this matches on PEARL's own names, its research aliases and
 * its product map, and only calls something missing when it really is.
 *
 * PEARL is deterministic and offline. This costs nothing to run and gives the same answer twice.
 */

export type DosageRowKind =
  | 'has dose'            // a single compound with dose figures
  | 'no dose'             // PEARL knows the compound but holds no figures: a genuine gap
  | 'blend'               // the dose belongs to each component, not the product
  | 'supply'              // water and the like; a dose does not apply
  | 'not a peptide'       // a vitamin or nutrient mixture
  | 'composition unknown' // PEARL says nobody has recorded what is in it
  | 'unaccounted for';    // PEARL has no record of any kind

export interface DosageSource { title: string | null; journal: string | null; year: string | null; url: string | null }

export interface DosageRow {
  name: string;
  slug: string;
  categories: string[];
  strengths: string[];
  /** "BAC water", "AA water (Acetic Acid 0.6%)" or "None needed". */
  water: string;
  kind: DosageRowKind;
  /** PEARL's record name, when a single compound sits behind the product. */
  pearlCompound: string | null;
  dose: Record<string, string> | null;
  schedule: string | null;
  cycle: string | null;
  evidence: string | null;
  /** PEARL's own words about what the product is. */
  pearlNote: string | null;
  /** For a blend or a mixture: what is in it. */
  components: string[];
  /** Where PEARL got a blend's split. */
  provenance: string | null;
  sources: DosageSource[];
  /** The question that produced the sources, so anyone can repeat it. */
  question: string | null;
}

const norm = (value: unknown) => String(value ?? '').toLowerCase().replace(/[^a-z0-9]/g, '');

const WATER_LABEL: Record<string, string> = {
  [RECONSTITUTION_TARGET_SLUG]: 'BAC water',
  [ACETIC_ACID_SLUG]: 'AA water (Acetic Acid 0.6%)',
};

/** Product name with supplier, pack size and strength stripped, so the compound is left. */
function coreName(name: string): string {
  return String(name)
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[•·]/g, ' ')
    .replace(/\b\d+(?:\.\d+)?\s*(?:mg|mcg|iu|ml)\b/gi, ' ')
    .replace(/\b\d+\s*s\b/gi, ' ')
    .replace(/\bwindsor glow\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function buildIndex(): Map<string, Record<string, unknown>> {
  const list = (Array.isArray(COMPOUNDS) ? COMPOUNDS : Object.values(COMPOUNDS)) as Record<string, unknown>[];
  const index = new Map<string, Record<string, unknown>>();
  for (const compound of list) {
    const aliases = Array.isArray(compound.researchAliases) ? compound.researchAliases : [];
    for (const key of [compound.name, compound.slug, ...aliases]) {
      const k = norm(key);
      if (k && !index.has(k)) index.set(k, compound);
    }
  }
  return index;
}

/** PEARL's own words about a product, whichever of its two record shapes it uses. */
function describe(composition: Record<string, unknown> | undefined): string | null {
  if (!composition) return null;
  if (composition.plain) return `${composition.what} — ${composition.plain}`;
  if (composition.plainName) {
    return [composition.plainName, composition.total, composition.note].filter(Boolean).join(' — ');
  }
  return null;
}

/** Every citation PEARL attached to an answer, however deeply it nests them. */
function collectSources(answer: unknown): DosageSource[] {
  const out: DosageSource[] = [];
  const walk = (node: unknown) => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) return node.forEach(walk);
    const n = node as Record<string, unknown>;
    const url = n.url ?? n.link ?? n.href ?? n.doi ?? n.pmid;
    if (url || n.journal || n.year || n.authors) {
      out.push({
        title: (n.title ?? n.name ?? n.label ?? null) as string | null,
        journal: (n.journal ?? null) as string | null,
        year: (n.year ?? null) as string | null,
        url: (url ?? null) as string | null,
      });
    }
    Object.values(n).forEach(walk);
  };
  walk(answer);
  const seen = new Set<string>();
  return out.filter((s) => {
    const key = JSON.stringify(s);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * The audit, for a catalogue already filtered to what is on sale.
 *
 * Sorted by name, which is exactly how visibleProducts orders the shop, so the order here is the
 * order of the website.
 */
export function buildDosageAudit(catalogue: Product[]): DosageRow[] {
  const index = buildIndex();
  const compositions = PRODUCT_COMPOSITIONS as Record<string, Record<string, unknown>>;

  return [...catalogue]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((product) => {
      const waterSlug = reconstitutionTargetFor(product);
      const composition = compositions?.[product.slug];

      const row: DosageRow = {
        name: product.name,
        slug: product.slug,
        categories: [...(product.categories ?? [])],
        strengths: (product.variants ?? []).filter((v) => v?.enabled !== false).map((v) => v.dosage).filter(Boolean),
        water: waterSlug ? (WATER_LABEL[waterSlug] ?? waterSlug) : 'None needed',
        kind: 'unaccounted for',
        pearlCompound: null,
        dose: null, schedule: null, cycle: null, evidence: null,
        pearlNote: describe(composition),
        components: Array.isArray(composition?.components)
          ? (composition!.components as Record<string, unknown>[]).map((c) => `${c.name} ${c.label ?? `${c.mg}mg`}`)
          : [],
        provenance: (composition?.provenance ?? null) as string | null,
        sources: [],
        question: null,
      };

      /* PEARL's product map settles what a product IS before any name matching. It is the only
         thing that can tell a blend or a supply apart from a single compound, and a blend has no
         dose of its own precisely because each of its components has one. */
      if (Array.isArray(composition?.components)) {
        row.kind = composition!.isPeptide === false ? 'not a peptide'
          : composition!.unknown ? 'composition unknown' : 'blend';
        return row;
      }
      if (composition?.unknown) { row.kind = 'composition unknown'; return row; }
      if (composition?.kind === 'supply') { row.kind = 'supply'; return row; }

      const candidates = [composition?.what as string | undefined, product.name, coreName(product.name)]
        .filter((v): v is string => Boolean(v));

      let compound: Record<string, unknown> | null = null;
      for (const candidate of candidates) {
        const hit = index.get(norm(candidate));
        if (hit) { compound = hit; break; }
      }
      if (!compound) {
        /* Containment BOTH WAYS, longest overlap wins. One way was not enough: the shop sells
           "CJC-1295" and PEARL files it as "CJC-1295 (no DAC)", so PEARL's name is the LONGER
           string and a product-contains-compound test missed it entirely. Longest wins so
           "IGF-1 LR3" is never answered with the record for "IGF-1". The four-character floor
           stops a short alias matching inside an unrelated word. */
        let best: { overlap: number; compound: Record<string, unknown> } | null = null;
        for (const candidate of candidates) {
          const hay = norm(candidate);
          if (hay.length < 4) continue;
          for (const [key, entry] of Array.from(index.entries())) {
            if (key.length < 4) continue;
            const overlap = hay.includes(key) ? key.length : (key.includes(hay) ? hay.length : 0);
            if (overlap && (!best || overlap > best.overlap)) best = { overlap, compound: entry };
          }
          if (best) break;
        }
        compound = best?.compound ?? null;
      }

      if (!compound) return row;

      row.pearlCompound = (compound.name ?? null) as string | null;
      row.dose = (compound.sourceDose ?? null) as Record<string, string> | null;
      row.schedule = (compound.sourceSchedule ?? null) as string | null;
      row.cycle = (compound.sourceCycle ?? null) as string | null;
      row.evidence = compound.evidenceScore != null
        ? `${compound.evidenceScore}${compound.evidenceNote ? ` — ${compound.evidenceNote}` : ''}`
        : null;
      row.kind = row.dose && Object.values(row.dose).some(Boolean) ? 'has dose' : 'no dose';

      // Ask PEARL the question a member would ask, so the sources are the ones it would cite.
      row.question = `What dosage numbers are listed for ${row.pearlCompound}?`;
      try {
        row.sources = collectSources(answerQuestion(row.question, [], {}));
      } catch {
        row.sources = [];
      }
      return row;
    });
}

/** One line per outcome, for the heading of the report. */
export function summariseDosageAudit(rows: DosageRow[]): Record<DosageRowKind, number> {
  const out = {} as Record<DosageRowKind, number>;
  for (const row of rows) out[row.kind] = (out[row.kind] ?? 0) + 1;
  return out;
}
