// Messages are English dictionary keys; CampaignPortal shows them through t().
const SESSION_KEY = 'biletflow.campaign.session'

export class CampaignError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.status = status
  }
}

function errorText(value) {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(errorText).join(' ')
  if (value && typeof value === 'object') return Object.entries(value).map(([key, message]) => `${key}: ${errorText(message)}`).join(' ')
  return ''
}

export function createCampaignApi(storage, transport = fetch, language) {
  let tokens = null
  let renewal = null
  let version = 0
  function clear() {
    tokens = null
    version += 1
    try { storage.removeItem(SESSION_KEY) } catch { /* Memory-only when storage is unavailable. */ }
  }
  function save(value) {
    if (typeof value?.access !== 'string' || typeof value?.refresh !== 'string') throw new CampaignError('Invalid session. Log in again.', 401)
    tokens = { access: value.access, refresh: value.refresh }
    try { storage.setItem(SESSION_KEY, JSON.stringify(tokens)) } catch { /* Memory-only fallback. */ }
  }
  try {
    const saved = storage.getItem(SESSION_KEY)
    if (saved) save(JSON.parse(saved))
  } catch { clear() }

  async function send(path, body, access, as = 'json') {
    let response
    try {
      response = await transport(`/api${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(access && { Authorization: `Bearer ${access}` }), ...(language && { 'Accept-Language': language() }) },
        ...(body !== undefined && { body: JSON.stringify(body) }),
        signal: AbortSignal.timeout(15000),
      })
    } catch { throw new CampaignError('Could not reach the server. Check your connection.') }
    if (response.status === 204) return null
    if (response.ok && as === 'blob') return response.blob()
    let data
    try { data = await response.json() } catch { throw new CampaignError('The server returned an unexpected response.', response.status) }
    if (!response.ok) throw new CampaignError(
      response.status === 401 ? 'The session has expired or the login details are wrong. Log in again.'
        : response.status === 429 ? 'Too many requests. Wait and try again.'
        : response.status >= 500 ? 'The server is temporarily unavailable.'
        : errorText(data) || 'The request failed.', response.status)
    return data
  }
  async function refresh() {
    if (!renewal) {
      const started = version
      const refreshToken = tokens?.refresh
      const pending = send('/auth/refresh', { refresh: refreshToken }).then(value => {
        if (version !== started) throw new CampaignError('Log in again.', 401)
        save(value)
      }).catch(error => {
        if (version === started && error.status === 401) clear()
        throw error
      }).finally(() => { if (renewal === pending) renewal = null })
      renewal = pending
    }
    return renewal
  }
  async function request(path, body, as = 'json') {
    if (!tokens) throw new CampaignError('Log in to an organizer account.', 401)
    const started = version
    const access = tokens.access
    try { return await send(path, body, access, as) } catch (error) {
      if (error.status !== 401 || started !== version) throw error
      if (tokens?.access === access) await refresh()
      if (!tokens || started !== version) throw new CampaignError('Log in again.', 401)
      try { return await send(path, body, tokens.access, as) } catch (failure) {
        if (failure.status === 401 && started === version) clear()
        throw failure
      }
    }
  }
  async function logout() {
    const refreshToken = tokens?.refresh
    clear()
    if (refreshToken) await send('/auth/logout', { refresh: refreshToken })
  }
  async function me() {
    const user = await request('/auth/me')
    if (!user.roles?.some(role => ['organizer', 'platform_admin'].includes(role))) {
      try { await logout() } catch { /* Credentials are already removed locally. */ }
      throw new CampaignError('An organizer or platform admin account is required.', 403)
    }
    return user
  }
  return {
    request, logout,
    blob(path) { return request(path, undefined, 'blob') },
    async restore() { return tokens ? me() : null },
    async login(email, password) {
      clear()
      save(await send('/auth/login', { email: email.trim(), password }))
      return me()
    },
    async list(path) {
      const items = []
      for (let page = 1; ; page += 1) {
        // Do not send JWTs to an absolute URL supplied by a paginated response.
        const result = await request(`${path}?page=${page}`)
        if (!Array.isArray(result.results)) throw new CampaignError('The server returned an invalid list.')
        items.push(...result.results)
        if (!result.next) return items
      }
    },
  }
}

export function campaignPayload(form, allowedTypeIds) {
  const name = form.name.trim()
  if (!name || name.length > 120) throw new Error('Name: 1 to 120 characters.')
  const type = form.discount_type
  if (!['percent', 'fixed'].includes(type)) throw new Error('Choose the discount type.')
  const raw = String(form.discount_value).trim().replace(',', '.')
  if (!(type === 'percent' ? /^\d+$/ : /^\d+(\.\d{1,2})?$/).test(raw)) throw new Error('Enter a valid discount; tenge amounts take up to two decimals.')
  const [whole, fraction = ''] = raw.split('.')
  const value = type === 'fixed' ? Number(whole) * 100 + Number(fraction.padEnd(2, '0')) : Number(whole)
  if (!Number.isSafeInteger(value) || value < 1 || value > (type === 'percent' ? 100 : 1000000000)) throw new Error('Discount: 1–100% or 0.01–10,000,000 ₸.')
  const starts = new Date(form.starts_at)
  const ends = new Date(form.ends_at)
  if (!Number.isFinite(starts.getTime()) || !Number.isFinite(ends.getTime()) || ends <= starts) throw new Error('Set the dates: the end must be after the start.')
  const limit = String(form.max_redemptions).trim()
  if (limit && (!/^\d+$/.test(limit) || Number(limit) < 1 || Number(limit) > 2147483647)) throw new Error('The limit must be a whole number from 1 to 2147483647.')
  const ids = [...new Set(form.ticket_types.map(Number))]
  if (ids.some(id => !allowedTypeIds.includes(id))) throw new Error('This ticket type does not belong to the selected event.')
  return { name, discount_type: type, discount_value: value, starts_at: starts.toISOString(), ends_at: ends.toISOString(), max_redemptions: limit ? Number(limit) : null, ticket_types: ids, enabled: true }
}
