import { test } from 'node:test'
import assert from 'node:assert/strict'
import { activationStatus, buildCsv, listAll, loadPromoActivity, supportStatus } from '../src/mirat/adminData.js'

test('admin lists every paginated result without losing the original query', async () => {
  const calls = []
  const api = async path => {
    calls.push(path)
    return path.endsWith('page=1')
      ? { results: [{ id: 1 }], next: '/api/admin/users?page=2' }
      : { results: [{ id: 2 }], next: null }
  }
  assert.deepEqual(await listAll(api, '/admin/users?search=mirat'), [{ id: 1 }, { id: 2 }])
  assert.deepEqual(calls, ['/admin/users?search=mirat&page=1', '/admin/users?search=mirat&page=2'])
})

test('promo activity combines campaigns from all events newest first', async () => {
  const api = async path => ({
    results: path.includes('/1/')
      ? [{ id: 10, created_at: '2026-11-01T10:00:00Z' }]
      : [{ id: 20, created_at: '2026-11-02T10:00:00Z' }],
    next: null,
  })
  const rows = await loadPromoActivity(api, [
    { id: 1, title: 'Jazz', organizer: 7 },
    { id: 2, title: 'Tech', organizer: 8 },
  ])
  assert.deepEqual(rows.map(row => [row.id, row.event_title, row.organizer]), [
    [20, 'Tech', 8],
    [10, 'Jazz', 7],
  ])
})

test('CSV export quotes commas, quotes and newlines and keeps UTF-8 text', () => {
  const csv = buildCsv(
    [{ label: 'Название', value: row => row.name }, { label: 'Сумма', value: row => row.total }],
    [{ name: 'Jazz, "Night"\nAlmaty', total: 5000 }],
  )
  assert.equal(csv, '\uFEFFНазвание,Сумма\r\n"Jazz, ""Night""\nAlmaty",5000\r\n')
})

test('admin statuses have readable Russian labels', () => {
  assert.equal(activationStatus('active'), 'Активно')
  assert.equal(supportStatus('waiting_for_customer'), 'Ожидает пользователя')
  assert.equal(supportStatus('custom'), 'custom')
})
