import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoryColors } from '../src/utils/categoryColors.js'

test('every known category has its own color', () => {
  const known = ['music', 'education', 'sports', 'tech', 'arts', 'business', 'other']
  assert.equal(new Set(known.map((name) => categoryColors(name).solid)).size, known.length)
})

test('category names are matched as organizers type them', () => {
  assert.equal(categoryColors(' Music '), categoryColors('music'))
})

test('unknown and empty categories use the default color', () => {
  for (const name of ['', null, undefined, 'Кино', 'constructor']) {
    assert.equal(categoryColors(name), categoryColors('other'))
  }
})
