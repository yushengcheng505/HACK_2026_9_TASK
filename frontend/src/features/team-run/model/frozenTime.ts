/** Отладка: `?t=8.5` в адресе останавливает прогон на 8.5 секунде. */
export function readFrozenTime(search = window.location.search): number | null {
  const raw = new URLSearchParams(search).get('t')
  if (raw === null || raw.trim() === '') return null
  const value = Number(raw)
  return Number.isFinite(value) && value >= 0 ? value : null
}
