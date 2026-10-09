/** The address people write to, if the build was given one. Without it the contact page says where else to go. */
export const supportEmail = (): string => (import.meta.env.VITE_SUPPORT_EMAIL as string | undefined)?.trim() ?? ''
