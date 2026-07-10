// Loaded with `node --import` before the test files, to install the resolver
// hook that lets Node follow the source's `./foo.js` → `./foo.ts` specifiers.

import { register } from 'node:module';

register('./ts-resolve-hook.mjs', import.meta.url);
