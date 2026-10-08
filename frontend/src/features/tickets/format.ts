/** A ticket code in groups of four, easier to read aloud and to type at the door: "AB12 CD34 ...". */
export function formatCode(code: string): string {
  return code.replace(/(.{4})/g, '$1 ').trim()
}
