/**
 * The short names for products that the Orders and Invoices search should treat as the same word.
 *
 * Kieran, 2026-09-25: "any shorter abbreviations of products eg Retatrutide Reta should be
 * allowed". Typing a short form already worked by accident, because "reta" is inside the word
 * "Retatrutide". The other direction did not: an order written down as "Reta 30mg" was invisible to
 * anybody who typed the full name. This file closes that, both ways.
 *
 * WHERE THE LIST COMES FROM. Not from a new list somebody has to remember to update. PEARL already
 * keeps a curated, source-tracked record of every compound's abbreviations, aliases, misspellings
 * and blend names, in src/lib/search/terminology.mjs, and it is reviewed. This reads
 * that. Add a term to PEARL and the admin search learns it on the next deploy, with no second list
 * to fall behind.
 *
 * The only thing written out by hand below is a handful of shop shorthands PEARL has no reason to
 * know, because they are ways Kieran writes an order down rather than research terminology.
 *
 * WHY IT LIVES ON THE SERVER. terminology.mjs is 60KB of records, sources and notes. Invoices
 * search in the database and read this directly. Orders search in the browser, so the Orders API
 * hands the finished groups down with the orders rather than shipping all of PEARL to the browser.
 */
import { CURATED_TERMINOLOGY, PEARL_BLEND_MAPPINGS } from '@/lib/search/terminology.mjs';

/** Lower case, accents flattened. Must match fold() in src/lib/adminSearch.ts. */
function fold(value: string): string {
  return value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/**
 * Ways an order gets written down here that are not research terminology, so PEARL has no entry.
 * Every line is "these words all mean the same product". Add to it freely: a word that appears in
 * no order simply never matches anything.
 */
const SHOP_SHORTHAND: string[][] = [
  ['aod', 'aod-9604', 'aod9604'],
  ['tirez', 'tirzepatide', 'tirz'],
  ['cagri', 'cagrilintide'],
  ['tesa', 'tesamorelin'],
  ['bac', 'bac water', 'bacteriostatic water'],
  ['aa water', 'acetic acid'],
  ['caber', 'cabergoline'],
  ['hcg', 'human chorionic gonadotropin'],
  ['hmg', 'human menopausal gonadotropin'],
  ['pt141', 'pt-141', 'bremelanotide'],
  ['5amino', '5-amino-1mq', '5 amino'],
  ['glut', 'glutathione'],
  ['carnitine', 'l-carnitine'],
  ['ipa', 'ipamorelin'],
];

/** Records in PEARL that are notes about a term rather than another way of saying it. */
function shortFormsOf(record: Record<string, unknown>): string[] {
  const lists = ['aliases', 'abbreviations', 'misspellings', 'phoneticForms'];
  const out: string[] = [];
  for (const key of lists) {
    const value = record[key];
    if (Array.isArray(value)) out.push(...value.filter((v): v is string => typeof v === 'string'));
  }
  return out;
}

function buildGroups(): string[][] {
  const groups: string[][] = [];

  const add = (words: Array<string | undefined>) => {
    const cleaned = Array.from(new Set(
      words
        .filter((w): w is string => typeof w === 'string')
        .map(fold)
        // A one or two letter alias would match almost every order, so it is not worth having.
        // Anything with no letter or digit in it cannot be searched for at all.
        .filter(w => w.length >= 3 && /[a-z0-9]/.test(w))
    ));
    if (cleaned.length >= 2) groups.push(cleaned);
  };

  for (const record of CURATED_TERMINOLOGY as Array<Record<string, unknown>>) {
    add([record.displayName as string, record.canonicalSlug as string, ...shortFormsOf(record)]);
  }
  for (const blend of PEARL_BLEND_MAPPINGS as Array<Record<string, unknown>>) {
    add([blend.canonicalName as string, ...shortFormsOf(blend)]);
  }
  for (const line of SHOP_SHORTHAND) add(line);

  return groups;
}

/**
 * Every set of words that mean the same product. One word can appear in more than one set (TB is
 * both TB-500 and Thymosin Beta-4), and that is on purpose: typing it finds both.
 */
export const SEARCH_ALIAS_GROUPS: string[][] = buildGroups();
