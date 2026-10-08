export type Mode = 'signin' | 'register'

export interface Values {
  displayName: string
  email: string
  password: string
}

/** What is wrong with the values before asking the server, using the same rules the server applies. */
export function validate(mode: Mode, v: Values): Partial<Record<keyof Values, string>> {
  const errors: Partial<Record<keyof Values, string>> = {}
  if (mode === 'register' && !v.displayName.trim()) errors.displayName = 'Tell us what to call you'
  if (!v.email.trim()) errors.email = 'Enter your email'
  else if (!/^\S+@\S+\.\S+$/.test(v.email.trim())) errors.email = 'That does not look like an email address'
  if (!v.password) errors.password = 'Enter your password'
  else if (mode === 'register' && v.password.length < 8) errors.password = 'Use at least 8 characters'
  return errors
}
