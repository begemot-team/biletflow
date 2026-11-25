import { createSession } from '../api/session.js'

// Same key as the main site (api/client.js), so an admin signed in there
// opens /admin without a second login. The role is still checked on the server.
const KEY = 'biletflow.session'

export class AuthError extends Error {
  constructor(message, status = 0) {
    super(message)
    this.status = status
  }
}

function toAuthError(error) {
  const status = error?.status ?? 0
  const message = status === 0 ? 'Не удалось связаться с сервером. Попробуйте ещё раз.'
    : status === 429 ? 'Слишком много попыток. Подождите и повторите.'
    : status >= 500 ? 'Сервер временно недоступен. Попробуйте ещё раз.'
    : status === 401 ? 'Неверные данные входа или сессия истекла.'
    : 'Не удалось выполнить запрос. Проверьте данные и повторите.'
  return new AuthError(message, status)
}

// Per-tab storage; never persist passwords or trust a cached role.
// Login, token refresh and logout come from the shared web session
// (api/session.js); this module adds the platform-admin role check.
// The session is shared with the main site, so signing out here signs out there too.
export function createAdminAuth(storage, request = fetch) {
  const session = createSession({ storage, key: KEY, request, language: () => 'ru' }) // the admin portal is in Russian
  let restoring = null

  async function logout() {
    restoring = null
    try { await session.logout() } catch (error) { throw toAuthError(error) }
  }
  function requireAdmin(user) {
    if (user === null) return null
    // A non-admin keeps their main-site session; they just cannot use /admin.
    if (!Array.isArray(user?.roles) || !user.roles.includes('platform_admin')) {
      throw new AuthError('Доступ разрешён только администратору платформы.', 403)
    }
    return user
  }
  function restore() {
    if (!restoring) {
      const pending = session.restore()
        .then(requireAdmin, (error) => { throw toAuthError(error) })
        .finally(() => { if (restoring === pending) restoring = null })
      restoring = pending
    }
    return restoring
  }
  return {
    api: session.api,
    async login(email, password) {
      restoring = null
      try { await session.login(email, password) } catch (error) { throw toAuthError(error) }
      // Confirm privileges with the server instead of trusting login or storage metadata.
      try { return await restore() } catch (error) {
        // A non-admin account typed into the admin form is not kept signed in.
        if (error.status === 403) { try { await logout() } catch { /* Local credentials are already removed. */ } }
        throw error
      }
    },
    restore,
    logout,
    hasSession: session.hasSession,
  }
}
