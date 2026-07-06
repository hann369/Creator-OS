import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slugify, isMediaBlock } from '../src/lib/courseTypes.ts';

test('slugify converts titles into clean, URL-safe slugs', () => {
  // Simple case
  assert.equal(slugify('My First Course'), 'my-first-course');

  // Upper/lower case and spaces
  assert.equal(slugify('  Hello World   '), 'hello-world');

  // Special characters and numbers
  assert.equal(slugify('React & TypeScript 101!'), 'react-typescript-101');

  // Diacritics/Accents normalization (é -> e, ü -> u, etc.)
  assert.equal(slugify('Über-Kurs für Créators'), 'uber-kurs-fur-creators');

  // Long titles are sliced
  const longTitle = 'a'.repeat(100);
  assert.equal(slugify(longTitle).length, 60);

  // Empty or invalid inputs fallback to 'course'
  assert.equal(slugify('!!!'), 'course');
});

test('isMediaBlock correctly identifies media block types', () => {
  // Media blocks
  assert.equal(isMediaBlock('image'), true);
  assert.equal(isMediaBlock('video'), true);
  assert.equal(isMediaBlock('pdf'), true);

  // Non-media blocks
  assert.equal(isMediaBlock('text'), false);
  assert.equal(isMediaBlock('heading'), false);
  assert.equal(isMediaBlock('callout'), false);
  assert.equal(isMediaBlock('divider'), false);
  assert.equal(isMediaBlock('embed'), false);
});
