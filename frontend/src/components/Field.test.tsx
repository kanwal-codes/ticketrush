import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Field } from './Field'

describe('Field', () => {
  it('labels the input', () => {
    render(<Field label="Email" type="email" />)
    expect(screen.getByLabelText('Email')).toHaveAttribute('type', 'email')
  })

  it('links an error to the field, so it is read with it, and marks the field invalid', () => {
    render(<Field label="Email" error="Enter a valid email" hint="We email your tickets" />)
    const input = screen.getByLabelText('Email')
    expect(input).toBeInvalid()
    expect(input).toHaveAccessibleDescription('We email your tickets Enter a valid email')
  })

  it('is not marked invalid when there is no error', () => {
    render(<Field label="Email" />)
    expect(screen.getByLabelText('Email')).toBeValid()
  })
})
