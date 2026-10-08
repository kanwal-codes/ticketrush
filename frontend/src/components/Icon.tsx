import type { Tone } from '../lib/errorCopy'

/** The few icons the app needs, drawn with square ends to match the type and the ticket shapes. Decorative: the text says it. */
export type IconName = Tone | 'offline' | 'close'

const paths: Record<IconName, React.ReactNode> = {
  error: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v6M12 16.5v.5" />
    </>
  ),
  warning: (
    <>
      <path d="M12 3.5 21.5 20h-19z" />
      <path d="M12 10v4.5M12 17.5v.5" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7.5v.5" />
    </>
  ),
  success: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path className="icon__draw" d="m7.5 12.5 3 3 6-6.5" />
    </>
  ),
  offline: (
    <>
      <path d="M2.5 9a15 15 0 0 1 19 0M5.5 12.5a10.5 10.5 0 0 1 13 0M8.8 16a5.5 5.5 0 0 1 6.4 0" />
      <path d="M12 19.5v.5M3 3l18 18" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6 6 18" />,
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg className="icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="square" strokeLinejoin="miter" aria-hidden="true" focusable="false">
      {paths[name]}
    </svg>
  )
}
