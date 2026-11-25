import { test } from 'node:test'
import assert from 'node:assert/strict'
import { translate } from '../src/i18n/translate.js'
import { actionLabel, auditDescription, entityLabel, eventStatus, publicationLabel, statusLabel } from '../src/utils/eventHistory.js'

const now = new Date('2026-11-12T12:00:00Z')
const event = (changes = {}) => ({
  published: true,
  starts_at: '2026-11-12T10:00:00Z',
  ends_at: '2026-11-12T14:00:00Z',
  suspended_at: null,
  ...changes,
})

test('event history derives every supported lifecycle status', () => {
  assert.equal(eventStatus(event({ cancelled_at: '2026-11-12T11:00:00Z' }), now), 'cancelled')
  assert.equal(eventStatus(event({ suspended_at: '2026-11-12T11:00:00Z' }), now), 'suspended')
  assert.equal(eventStatus(event({ published: false }), now), 'draft')
  assert.equal(eventStatus(event({ starts_at: '2026-11-13T10:00:00Z', ends_at: '2026-11-13T14:00:00Z' }), now), 'upcoming')
  assert.equal(eventStatus(event(), now), 'active')
  assert.equal(eventStatus(event({ starts_at: '2026-11-11T10:00:00Z', ends_at: '2026-11-11T14:00:00Z' }), now), 'completed')
})

test('audit actions and statuses have readable labels', () => {
  assert.equal(actionLabel('event.suspended'), 'Event suspended')
  assert.equal(actionLabel('custom.audit_action'), 'Custom Audit_action')
  assert.equal(statusLabel('upcoming'), 'Upcoming')
})

test('cancelled events never show as published or draft', () => {
  assert.equal(publicationLabel({ published: true, cancelled_at: '2026-11-12T11:00:00Z' }), 'Cancelled::event')
  assert.equal(publicationLabel({ published: true }), 'Published')
  assert.equal(publicationLabel({ published: false }), 'Draft')
})

test('timeline entries follow the language', () => {
  const ru = (text, values) => translate('ru', text, values)
  const en = (text, values) => translate('en', text, values)
  assert.equal(entityLabel({ entity_type: 'TicketType', entity_id: 3 }, ru), 'Тип билета №3')
  assert.equal(entityLabel({ entity_type: 'Unknown', entity_id: 3 }, ru), 'Unknown #3')
  assert.equal(auditDescription({ action: 'payment.completed', description: '1440000 tiyn.' }, ru), '1440000 тиын.')
  assert.equal(auditDescription({ action: 'payment.completed', description: '1440000 tiyn.' }, en), '1440000 tiyn.')
  assert.equal(auditDescription({ action: 'support.opened', description: 'Category: refund.' }, ru), 'Категория: Возврат')
  assert.equal(auditDescription({ action: 'support.status_changed', description: 'open -> in_progress' }, ru), 'Открыто → В работе')
  assert.equal(auditDescription({ action: 'event.updated', description: 'capacity: 100 -> 300' }, ru), 'capacity: 100 -> 300')
})
