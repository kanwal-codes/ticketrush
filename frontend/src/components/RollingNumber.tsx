/** Shows a value that changes now and then (a total, a place in line); a new value rolls in instead of jumping. */
export function RollingNumber({ value, className = '' }: { value: string; className?: string }) {
  return (
    <span key={value} className={`roll ${className}`.trim()}>
      {value}
    </span>
  )
}
