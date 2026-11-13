export interface TypedText {
  text: string
  typing: boolean
}

export function typeOut(
  fullText: string,
  startedAt: number,
  now: number,
  charsPerSecond: number,
): TypedText {
  const count = Math.max(0, Math.floor((now - startedAt) * charsPerSecond))
  return { text: fullText.slice(0, count), typing: count < fullText.length }
}
