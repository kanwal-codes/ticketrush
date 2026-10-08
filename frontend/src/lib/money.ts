const cad = new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' })

/** Prices travel as whole cents. This is the only place they become a string for a person. */
export function formatMoney(cents: number): string {
  return cad.format(cents / 100)
}
