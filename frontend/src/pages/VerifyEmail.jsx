import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { api, session } from '../api/client'
import AuthCard from '../components/AuthCard'

export default function VerifyEmail() {
  const { hash } = useLocation()
  const params = new URLSearchParams(hash.slice(1))
  const uid = params.get('uid')
  const token = params.get('token')
  const [verifying, setVerifying] = useState(false)
  const [verified, setVerified] = useState(false)
  const [error, setError] = useState('')

  async function verify(event) {
    event.preventDefault()
    setVerifying(true)
    setError('')
    try {
      await api('/auth/verify-email', { method: 'POST', body: { uid, token }, auth: false })
      await session.restore().catch(() => {})
      setVerified(true)
    } catch (failure) {
      setError(failure.status === 400
        ? 'This link is invalid, expired or already used. Request a new link from your account.'
        : failure.message)
    } finally {
      setVerifying(false)
    }
  }

  return (
    <AuthCard title={verified ? 'Email verified' : 'Verify your email'}
      footer={<Link to="/account" className="text-indigo-600 underline">Go to my account</Link>}>
      {verified ? (
        <p role="status">Your email address is verified.</p>
      ) : !uid || !token ? (
        <p role="alert">Open the link from your verification email or request a new link from your account.</p>
      ) : (
        <form onSubmit={verify} className="space-y-4">
          <p>Confirm the email address for your BiletFlow account.</p>
          {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
          <button disabled={verifying} className="w-full rounded bg-black py-2.5 text-white disabled:opacity-50">
            {verifying ? 'Verifying…' : 'Verify email'}
          </button>
        </form>
      )}
    </AuthCard>
  )
}
