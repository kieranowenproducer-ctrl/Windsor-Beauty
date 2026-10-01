// Windsor Glow voice-to-text vocabulary (v3 Stage 7).
//
// Whisper does NOT support per-speaker voice training — what it DOES support is
// a `prompt` vocabulary/style hint (~224 tokens) that dramatically improves
// recognition of domain terms, plus post-transcription correction. This module
// holds both levers:
//   1. buildWhisperPrompt(context)  — the vocabulary hint, biased by which kind
//      of field the user is dictating into (product fields lean harder on
//      peptide names + dosages).
//   2. applyCorrections(text)       — a correction dictionary for known
//      mishears. Grows over time: when a transcription is corrected by hand,
//      add the mishear → correct pair here.

export type VoiceContext = 'task' | 'product' | 'general';

// Peptide/product terms Whisper otherwise mangles. Keep this list fresh as the
// catalogue grows — it is the single highest-impact accuracy lever.
const PRODUCT_TERMS = [
  'Windsor Glow', 'peptide', 'peptides', 'vial', 'dosage', 'purity', 'COA', 'certificate of analysis',
  'Retatrutide', 'Tirzepatide', 'Semaglutide', 'BPC-157', 'TB-500', 'CJC-1295', 'Ipamorelin',
  'AHK-Cu', 'ARA-290', 'GHK-Cu', 'Semax', 'Selank', 'Cagrilintide', 'Tesamorelin', 'Sermorelin',
  'Melanotan', 'PT-141', 'NAD+', 'MOTS-C', '5-Amino-1MQ', 'Epithalon', 'Dihexa', 'bacteriostatic water',
  '10mg', '15mg', '30mg', '50mg', '70mg', '100mg', 'mcg', 'milligrams',
];

const TASK_TERMS = [
  'to-do list', 'task', 'admin panel', 'product page', 'checkout', 'invoice', 'dispatch',
  'blog post', 'homepage', 'mobile', 'screenshot', 'deploy', 'approve', 'revision',
];

export function buildWhisperPrompt(context: VoiceContext): string {
  // Whisper treats the prompt as preceding conversation — a natural sentence
  // carrying the vocabulary outperforms a bare word list.
  const productPart = `We sell research peptides such as ${PRODUCT_TERMS.slice(6, 24).join(', ')}, in dosages like 10mg, 50mg and 100mg, each with 99% purity and a certificate of analysis.`;
  const taskPart = `This is a note about the Windsor Glow website admin: ${TASK_TERMS.join(', ')}.`;
  if (context === 'product') return `${productPart} ${taskPart}`;
  if (context === 'task') return `${taskPart} ${productPart}`;
  return `${taskPart}`;
}

// Known mishears → corrections. Case-insensitive whole-phrase replacement.
// Add pairs here whenever a real transcription gets a term wrong.
const CORRECTIONS: [RegExp, string][] = [
  [/\bwindsor glo\b/gi, 'Windsor Glow'],
  [/\bwinds? or glow\b/gi, 'Windsor Glow'],
  [/\bretatru?tide\b/gi, 'Retatrutide'],
  [/\breta ?true ?tide\b/gi, 'Retatrutide'],
  [/\bter?zepatide\b/gi, 'Tirzepatide'],
  [/\bsemi?glutide\b/gi, 'Semaglutide'],
  [/\bbpc ?157\b/gi, 'BPC-157'],
  [/\btb ?500\b/gi, 'TB-500'],
  [/\bcjc ?1295\b/gi, 'CJC-1295'],
  [/\bahk ?c(?:u|opper)\b/gi, 'AHK-Cu'],
  [/\bara ?290\b/gi, 'ARA-290'],
  [/\bghk ?c(?:u|opper)\b/gi, 'GHK-Cu'],
  [/\bmilligrams?\b/gi, 'mg'],
  [/(\d+)\s*milli ?grams?/gi, '$1mg'],
  [/(\d+)\s*migs?\b/gi, '$1mg'],
  [/\bsee oh ay\b/gi, 'COA'],
];

export function applyCorrections(text: string): string {
  let out = text;
  for (const [re, to] of CORRECTIONS) out = out.replace(re, to);
  return out;
}
