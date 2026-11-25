import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { fieldErrors } from '../api/client'
import { useAuth } from '../auth/auth'
import AuthCard, { Field } from '../components/AuthCard'
import { useI18n } from '../i18n/i18n.js'

function Login() {
  const { t } = useI18n()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ email: '', password: '' })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const update = (e) => setForm({ ...form, [e.target.name]: e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setErrors({})
    try {
      await login(form.email, form.password)
      navigate(location.state?.from ?? '/', { replace: true })
    } catch (err) {
      // Backend answers bad credentials with 403 (auth view has no authenticators), not 401
      const badCredentials = err.status === 401 || err.status === 403
      setErrors({ ...fieldErrors(err), form: badCredentials ? 'Wrong email or password.' : err.message })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title={t('Login')}
      footer={
        <>
          {t('New to Begemot.com?')}{' '}
          <Link to="/register" state={location.state} className="text-brand-700 underline">
            {t('Register')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label={t('Email')} name="email" type="email" autoComplete="email" required
          value={form.email} onChange={update} error={errors.email} />
        <div className="relative">
          <Field label={t('Password')} name="password" type="password" autoComplete="current-password" required
            value={form.password} onChange={update} error={errors.password} className="pr-28" />
          <Link to="/forgot-password" state={location.state}
            className="absolute right-3 top-3 text-sm text-brand-700 underline">
            {t('Forgot?')}
          </Link>
        </div>
        {errors.form && <p role="alert" className="text-sm text-red-600">{t(errors.form)}</p>}
        <button disabled={submitting} className="w-full rounded bg-brand-600 hover:bg-brand-700 py-2.5 text-lg text-white disabled:opacity-50">
          {submitting ? t('Logging in…') : t('Login')}
        </button>
      </form>
    </AuthCard>
  )
}

export default Login
