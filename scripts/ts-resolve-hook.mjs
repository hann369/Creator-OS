// The source uses NodeNext-style `./foo.js` specifiers that actually point at
// `./foo.ts`. Bundlers and tsc resolve those; Node's type stripping does not, so
// `node --test` could only ever import leaf modules with no relative imports.
//
// This hook maps a relative `.js` specifier to its `.ts`/`.tsx` sibling when the
// importer is TypeScript and that sibling exists. Zero dependencies, matching
// the test harness's ethos (Phase 0).

import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const TS_IMPORTER = /\.[cm]?tsx?$/;

export async function resolve(specifier, context, nextResolve) {
  const parent = context.parentURL;
  if (specifier.startsWith('.') && specifier.endsWith('.js') && parent && TS_IMPORTER.test(parent)) {
    const base = specifier.slice(0, -'.js'.length);
    for (const ext of ['.ts', '.tsx']) {
      const candidate = new URL(base + ext, parent);
      if (existsSync(fileURLToPath(candidate))) {
        return nextResolve(base + ext, context);
      }
    }
  }
  return nextResolve(specifier, context);
}
