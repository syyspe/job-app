// "1 email", "2 emails": the noun's plural is its singular plus s.
export function counted(n: number, noun: string): string {
  return `${n} ${noun}${n === 1 ? '' : 's'}`
}
