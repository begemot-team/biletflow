import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { SHOWCASE, showcaseCount } from '../src/utils/showcase.js'

test('every slide has its photo and names the author and license', () => {
  for (const slide of SHOWCASE) {
    assert.ok(existsSync(new URL(`../src/assets/hero/${slide.photo}.webp`, import.meta.url)), slide.photo)
    assert.ok(slide.author && slide.source && slide.license.name && slide.license.url, slide.title)
  }
  assert.equal(new Set(SHOWCASE.map(({ photo }) => photo)).size, SHOWCASE.length)
})

test('dated slides are events that have already happened', () => {
  for (const { date, title } of SHOWCASE) {
    if (date) assert.ok(new Date(date) < new Date(), title)
  }
})

test('large counts are grouped, years and heights are not', () => {
  assert.equal(showcaseCount({ count: 31000 }), '31 000')
  assert.equal(showcaseCount({ count: 2013 }), '2013')
  assert.equal(showcaseCount({ count: 57 }), '57')
})
