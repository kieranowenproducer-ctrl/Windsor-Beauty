// Compliance checker for educational peptide/science content. Flags risky
// language BEFORE approval — warnings, not automatic blocks: a human reviews
// every flag. Categories cover medical claims, dosing, and sales language
// that are unsafe for research-chemical educational content.

export interface ComplianceWarning {
  category: string;
  term: string;
  severity: 'high' | 'medium';
  advice: string;
}

const RULES: { category: string; severity: 'high' | 'medium'; advice: string; patterns: RegExp[] }[] = [
  { category: 'Dosage / administration', severity: 'high',
    advice: 'Never give dosing or administration guidance. Keep content mechanism-focused.',
    patterns: [/\bdos(e|es|age|ing)\b/i, /\binject(ion|ing|s)?\b/i, /\bmg\b/i, /\bhow (much|often) to take\b/i, /\bsubcutaneous|intramuscular\b/i, /\breconstitut/i] },
  { category: 'Fat loss claims', severity: 'high',
    advice: 'Weight/fat loss claims are medical claims. Describe research areas, not outcomes.',
    patterns: [/\b(fat|weight) ?loss\b/i, /\bburn(s|ing)? fat\b/i, /\blose weight\b/i, /\bslim(ming)?\b/i] },
  { category: 'Muscle gain claims', severity: 'high',
    advice: 'Performance/muscle claims invite platform takedowns and regulatory risk.',
    patterns: [/\bmuscle (gain|growth|building)\b/i, /\bbuild(s)? muscle\b/i, /\bgains\b/i, /\banabolic\b/i] },
  { category: 'Anti-ageing claims', severity: 'medium',
    advice: 'Frame as "research into cellular ageing", never as a personal benefit.',
    patterns: [/\banti[- ]?ag(e|ing|eing)\b/i, /\byounger (skin|looking)\b/i, /\breverse ageing\b/i, /\bwrinkle/i] },
  { category: 'Healing / recovery claims', severity: 'high',
    advice: 'Injury-healing claims are treatment claims. Discuss published research neutrally.',
    patterns: [/\bheal(s|ing)?\b/i, /\brepair(s|ing)? (tissue|tendon|muscle|injur)/i, /\brecover(y|ies) (from|time)\b/i] },
  { category: 'Disease treatment claims', severity: 'high',
    advice: 'Never associate products with treating, curing or preventing any condition.',
    patterns: [/\btreat(s|ment|ing)?\b/i, /\bcure(s|d)?\b/i, /\bprevent(s|ion)?\b/i, /\bdiabetes|cancer|arthritis|alzheim/i, /\btherap(y|eutic)\b/i] },
  { category: 'Sales language', severity: 'high',
    advice: 'Educational content must not sell. Remove purchase prompts entirely.',
    patterns: [/\bbuy now\b/i, /\bpurchase\b/i, /\bshop (now|here)\b/i, /\bdiscount|promo code|sale\b/i, /\border (now|today|yours)\b/i, /\blink in bio to (buy|order|shop)\b/i] },
  { category: 'Guaranteed results', severity: 'high',
    advice: 'Guarantees and before/after framing are prohibited claim structures.',
    patterns: [/\bguaranteed?( results)?\b/i, /\bbefore (and|\/|&) ?after\b/i, /\bresults in \d+/i, /\bproven to\b/i, /\bworks every time\b/i] },
  { category: 'Medical advice language', severity: 'medium',
    advice: 'Avoid second-person advice ("you should"). Present third-person research only.',
    patterns: [/\byou should (take|try|use)\b/i, /\bask your doctor\b/i, /\brecommended (dose|for you)\b/i, /\bsafe for (you|human)/i, /\bprescri(be|ption)\b/i] },
];

export function checkCompliance(text: string): ComplianceWarning[] {
  const warnings: ComplianceWarning[] = [];
  for (const rule of RULES) {
    for (const re of rule.patterns) {
      const m = text.match(re);
      if (m) {
        warnings.push({ category: rule.category, term: m[0], severity: rule.severity, advice: rule.advice });
        break; // one warning per category is enough signal
      }
    }
  }
  return warnings;
}
