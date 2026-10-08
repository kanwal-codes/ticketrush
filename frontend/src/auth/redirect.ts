/** Where to go after signing in. Only paths on this site: a link must not be able to send a guest elsewhere. */
export function safeRedirect(from: unknown): string {
  return typeof from === 'string' && from.startsWith('/') && !from.startsWith('//') && !from.includes('\\') ? from : '/'
}
