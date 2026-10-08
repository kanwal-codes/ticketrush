import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Poster, type PosterProps, type PosterStyle } from './Poster'

const base: Omit<PosterProps, 'style'> = {
  inkOne: '#2b2fd9',
  inkTwo: '#ff5a36',
  paperColor: '#ffd9c4',
  title: 'Afterlight Tour',
  artist: 'Mira Okafor',
  city: 'Montreal',
  startsAt: '2026-11-14T20:00:00Z',
}

const styles: PosterStyle[] = ['ORBIT', 'SUN', 'CURTAIN', 'AURORA', 'PITCH', 'VINYL']

describe('Poster', () => {
  it.each(styles)('draws the %s style with the event title and a date', (style) => {
    const { container } = render(<Poster {...base} style={style} />)
    const text = container.textContent ?? ''
    expect(text).toMatch(/AFTERLIGHT|TOUR/)
    expect(text).toMatch(/\d\d\.\d\d/)
    expect(container.querySelector('svg')).toHaveAttribute('data-style', style)
  })

  it('is hidden from screen readers, because the page already says what the event is', () => {
    const { container } = render(<Poster {...base} style="ORBIT" />)
    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
  })

  it('keeps ids unique when several posters share a page', () => {
    const { container } = render(
      <>
        <Poster {...base} style="PITCH" />
        <Poster {...base} style="PITCH" />
      </>,
    )
    const ids = [...container.querySelectorAll('[id]')].map((e) => e.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('swaps in a legible color when the organizer picks ink the same as the paper', () => {
    const { container } = render(<Poster {...base} style="ORBIT" inkOne="#ffd9c4" />)
    const title = [...container.querySelectorAll('text')].find((t) => t.textContent === 'AFTERLIGHT')
    expect(title).toBeDefined()
    expect(title?.getAttribute('fill')).not.toBe('#ffd9c4')
  })

  it('copes with a very long title and an empty artist', () => {
    const { container } = render(<Poster {...base} style="SUN" title="The Extraordinarily Long Title Of An Unusually Ambitious Production" artist="" />)
    expect(container.querySelectorAll('text').length).toBeGreaterThan(0)
  })
})
