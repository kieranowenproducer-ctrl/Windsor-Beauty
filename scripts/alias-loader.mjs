// Lets plain `node` run the app's TypeScript modules directly by resolving the
// `@/...` path alias the way tsconfig does. Node 24 strips types natively, so
// with this hook the concierge library is testable end to end without a
// bundler, a test framework, or a running server.
//
//   node --import ./scripts/alias-loader.mjs scripts/test-concierge-live.mjs

import { registerHooks } from 'node:module';
import { statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(root, '..', 'src');

// `.ts` before the bare path, and the bare path must be a FILE: `@/lib/db`
// resolves to both a `db.ts` file and a `db/` directory, and picking the
// directory makes Node try to read it as source.
const EXTS = ['.ts', '.tsx', '.mjs', '.js', '', '/index.ts', '/index.tsx'];

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

function resolveAlias(specifier) {
  if (!specifier.startsWith('@/')) return null;
  const base = path.join(src, specifier.slice(2));
  for (const ext of EXTS) {
    const candidate = base + ext;
    if (isFile(candidate)) return pathToFileURL(candidate).href;
  }
  return null;
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    const hit = resolveAlias(specifier);
    if (hit) return { url: hit, shortCircuit: true };
    // Relative imports inside .ts files often omit the extension, which Node's
    // ESM resolver will not do for us.
    if (specifier.startsWith('.') && context.parentURL?.startsWith('file:')) {
      const from = path.dirname(fileURLToPath(context.parentURL));
      const base = path.resolve(from, specifier);
      if (!isFile(base)) {
        for (const ext of EXTS) {
          const candidate = base + ext;
          if (ext && isFile(candidate)) return { url: pathToFileURL(candidate).href, shortCircuit: true };
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
