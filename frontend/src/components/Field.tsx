import {
  createElement,
  useId,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react'

interface Common {
  label: string
  /** Shown under the field, and linked to it so a screen reader reads it with the field. */
  error?: string
  hint?: string
}

type Props =
  | (Common & { as?: 'input' } & Omit<InputHTMLAttributes<HTMLInputElement>, 'id'>)
  | (Common & { as: 'select'; children: ReactNode } & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'>)
  | (Common & { as: 'textarea' } & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'>)

/** A labelled input, select or textarea whose hint and error are read out with it. */
export function Field(props: Props) {
  const { label, error, hint, as = 'input', ...control } = props as Common & { as?: string } & Record<string, unknown>
  const id = useId()
  const describedBy = [hint ? `${id}-hint` : '', error ? `${id}-error` : ''].filter(Boolean).join(' ') || undefined
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      {createElement(as, { id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy, ...control })}
      {hint && (
        <p id={`${id}-hint`} className="field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className="field__error">
          {error}
        </p>
      )}
    </div>
  )
}
