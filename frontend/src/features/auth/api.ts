import { useQuery } from '@tanstack/react-query'
import { api, unwrap } from '../../api/client'
import { setToken, useToken } from '../../auth/session'

export const meKey = ['me'] as const

/** The signed-in guest, or nothing when signed out. */
export function useMe() {
  const token = useToken()
  return useQuery({
    queryKey: meKey,
    queryFn: () => unwrap(api.GET('/api/me')),
    enabled: token !== null,
    staleTime: 5 * 60_000,
  })
}

export async function signIn(email: string, password: string): Promise<void> {
  const token = await unwrap(api.POST('/api/auth/login', { body: { email, password } }))
  setToken(token.accessToken)
}

/** Creates the account, then signs in with the same details. */
export async function register(details: { displayName: string; email: string; password: string; turnstileToken?: string }): Promise<void> {
  await unwrap(api.POST('/api/auth/register', { body: details }))
  await signIn(details.email, details.password)
}

/** Asks for a reset link. The server answers the same whether or not the address has an account. */
export async function forgotPassword(email: string): Promise<void> {
  await unwrap(api.POST('/api/auth/forgot-password', { body: { email } }))
}

export async function resetPassword(token: string, password: string): Promise<void> {
  await unwrap(api.POST('/api/auth/reset-password', { body: { token, password } }))
}

export async function verifyEmail(token: string): Promise<void> {
  await unwrap(api.POST('/api/auth/verify-email', { body: { token } }))
}

/** A new confirmation link for the signed-in guest. */
export async function resendVerification(): Promise<void> {
  await unwrap(api.POST('/api/auth/verify-email/resend'))
}
