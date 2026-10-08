/** The public site key the build was given. Without one there is no bot check and no third-party script. */
export const turnstileSiteKey = (): string => (import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined)?.trim() ?? ''
