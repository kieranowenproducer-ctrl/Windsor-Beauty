// Linting for the shop.
//
// WHY THIS FILE EXISTS. Next.js used to ship a linter and run it during the build.
// Next 16 removed both, and this project never had a config of its own, so for a while
// nothing was checking the code at all. The typechecker catches wrong types; it does not
// catch a React hook called conditionally, an <a> where a <Link> belongs, or a stale
// suppression left behind after the problem it hid was fixed. That is this file's job.
//
// Run it with `npm run lint`.
//
// THE RULE FOR CHANGING THIS FILE: a linter that reports things nobody fixes is worse
// than no linter, because people learn to scroll past it. The bar is that `npm run lint`
// passes cleanly. If a rule fires a lot and the fires are not bugs, turn it off HERE with
// a comment saying why, rather than sprinkling `eslint-disable` through the code or
// leaving a permanent wall of warnings for everyone to ignore.

import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,

  {
    rules: {
      // ── Off: correct code that these rules misread ────────────────────────
      //
      // Apostrophes and quotes in ordinary prose. This is a shop; the pages are full of
      // sentences like "we don't" and "you'll". Writing them as &apos; makes the copy
      // harder to read and edit, and React escapes its output anyway.
      'react/no-unescaped-entities': 'off',

      // Assigning window.location to a relative path. All three uses are deliberate
      // FULL page loads, which is the point: one downloads a CSV from an API route, and
      // two reset auth state so the middleware re-evaluates it from scratch (the client
      // router's cache caused a stale redirect that needed a second click). A <Link>
      // would do the wrong thing in every case.
      '@next/next/no-location-assign-relative-destination': 'off',

      // ── Warn: worth seeing, not worth blocking ───────────────────────────
      //
      // A plain <img> instead of next/image. Two sites, both deliberate: certificate
      // pages and QR leaflets carry images of unknown and variable proportions, and
      // forcing them into a fixed box crops them. Both already carry a comment.
      '@next/next/no-img-element': 'warn',

      // Effect dependency lists. Several are deliberately incomplete to avoid a loop,
      // and those carry their own inline note. Worth seeing in new code.
      'react-hooks/exhaustive-deps': 'warn',

      // ── Off: React Compiler readiness, not bugs ──────────────────────────
      //
      // THESE ARE NOT SWITCHED OFF BECAUSE THEY ARE WRONG. They come from the React
      // Compiler's rule set, which arrived with React 19, and they describe patterns the
      // compiler cannot safely optimise: setting state directly inside an effect, calling
      // Date.now() while rendering, reading a ref during render, defining a component
      // inside another component.
      //
      // None of them is a fault in the site as it runs today, and there are 75 of them —
      // the ordinary shape of React written before the compiler existed. Fixing all 75
      // would mean rewriting working UI across the whole shop for no customer benefit,
      // and leaving them on would bury the rules above that DO matter.
      //
      // >>> TURN THESE BACK ON BEFORE ENABLING THE REACT COMPILER. <<<
      // Switching `reactCompiler: true` on in next.config.js without clearing these first
      // would be the compiler optimising code it has already told you it cannot reason
      // about. That is the one situation where this list becomes a real problem.
      //
      // MEASURED 11 August 2026, and the answer was NO. The compiler was installed and
      // built successfully, so the question was worth rather than possible. It costs every
      // visitor 253,844 more bytes of JavaScript (+5.4%) and makes the build 39% slower,
      // and 50 of the 75 findings are in admin screens two people use. The counts below
      // were recounted on the same day: the total was written as 76 and is 75, and purity
      // was written as 6 and is 5. Full evidence, including the opt-in `annotation` mode
      // that would allow one screen without clearing all 75:
      // _Planning-Library/08_technical-architecture/2026-08-11-thin-it-out-plan.md
      'react-hooks/set-state-in-effect': 'off',        // 52 of them
      'react-hooks/static-components': 'off',          // 9
      'react-hooks/purity': 'off',                     // 5, all Date.now() during render
      'react-hooks/refs': 'off',                       // 5
      'react-hooks/immutability': 'off',               // 2
      'react-hooks/preserve-manual-memoization': 'off',// 2
    },
  },

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',

    // Generated evidence and audit files, not hand-written source.
    'docs/*.generated.json',

    // ── DO NOT LINT: these are copies, not this app's code ────────────────
    //
    // src/lib/costs/*.ts are byte-identical copies of the Social Engine's files, and
    // `npm run check:costs` fails the moment they differ. The Social Engine's copy is
    // the original; a change belongs there and then gets copied here.
    //
    // THIS IS NOT THEORETICAL. Adding this linter, `eslint --fix` helpfully stripped two
    // `eslint-disable` comments from ledger.ts that it judged unused. They are used on
    // the other side. check:costs went red immediately, which is exactly what it is for.
    // Ignoring these files means the next person running --fix cannot repeat it.
    'src/lib/costs/pricing.ts',
    'src/lib/costs/ledger.ts',
    'src/lib/costs/period.ts',

    // The PEARL research library: generated data and Kieran's own Codex work.
    // Standing instruction, 6 August 2026 — do not interfere with it.
    'src/lib/concierge/research/**',
  ]),
]);
