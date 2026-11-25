import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { api, fieldErrors } from '../api/client'
import { useAuth } from '../auth/auth'
import AuthCard, { Field } from '../components/AuthCard'
import { useI18n } from '../i18n/i18n.js'

function Register() {
  const { t } = useI18n()
  const { login } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '', organizer: false })
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)

  const update = (e) =>
    setForm({ ...form, [e.target.name]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })

  async function onSubmit(e) {
    e.preventDefault()
    setSubmitting(true)
    setErrors({})
    // Backend rejects unknown fields; phone only exists on the organizer profile.
    const body = { email: form.email, password: form.password, first_name: form.name }
    if (form.organizer) {
      body.account_type = 'organizer'
      body.organizer_profile = {
        display_name: form.name,
        contact_email: form.email,
        contact_phone: form.phone,
      }
    }
    try {
      await api('/auth/register', { method: 'POST', body, auth: false })
      await login(form.email, form.password) // register returns no tokens
      navigate(location.state?.from ?? (form.organizer ? '/organizer/events/new' : '/'), { replace: true })
    } catch (err) {
      const errs = fieldErrors(err)
      const profile = err.body?.organizer_profile ?? {}
      setErrors({
        ...errs,
        name: errs.first_name ?? profile.display_name?.[0],
        phone: profile.contact_phone?.[0],
        form: errs.non_field_errors ?? (err.status >= 500 || !err.body ? err.message : undefined),
      })
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthCard
      title={t('Register')}
      footer={
        <>
          {t('Already have an account?')}{' '}
          <Link to="/login" state={location.state} className="text-indigo-600 underline">
            {t('Login')}
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-5" noValidate>
        <Field label={t('Name')} name="name" autoComplete="name" required
          value={form.name} onChange={update} error={errors.name} />
        {form.organizer && (
          <Field label={t('Phone')} name="phone" type="tel" autoComplete="tel"
            value={form.phone} onChange={update} error={errors.phone} />
        )}
        <Field label={t('Email')} name="email" type="email" autoComplete="email" required
          value={form.email} onChange={update} error={errors.email} />
        <Field label={t('Password')} name="password" type="password" autoComplete="new-password" required
          value={form.password} onChange={update} error={errors.password} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="organizer" checked={form.organizer} onChange={update} />
          {t('I want to organize events')}
        </label>
        {errors.form && <p role="alert" className="text-sm text-red-600">{t(errors.form)}</p>}
        <button disabled={submitting} className="w-full rounded bg-black py-2.5 text-lg text-white disabled:opacity-50">
          {submitting ? t('Creating account…') : t('Register')}
        </button>
      </form>
    </AuthCard>
  )
}

export default Register
