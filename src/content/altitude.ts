// Non-linear altitude scale: scroll progress (0..1) → metres.
// Most of the scroll is spent on the mountain, space goes by fast.
const KEYS: Array<[progress: number, metres: number]> = [
  [0, 0],
  [0.6, 8_848],
  [0.8, 100_000],
  [1, 400_000],
]

export function progressToMetres(p: number): number {
  const t = Math.min(1, Math.max(0, p))
  for (let i = 1; i < KEYS.length; i++) {
    const [p0, m0] = KEYS[i - 1]
    const [p1, m1] = KEYS[i]
    if (t <= p1) return m0 + ((t - p0) / (p1 - p0)) * (m1 - m0)
  }
  return KEYS[KEYS.length - 1][1]
}

const ZONES: Array<[maxMetres: number, name: string]> = [
  [500, 'Базовый лагерь'],
  [3_000, 'Подножие'],
  [8_500, 'Склон'],
  [9_500, 'Вершина'],
  [100_000, 'Атмосфера'],
  [Infinity, 'Орбита'],
]

export function zoneOf(metres: number): string {
  return ZONES.find(([max]) => metres < max)![1]
}

export function formatAltitude(metres: number): { value: string; unit: string } {
  if (metres < 10_000) return { value: Math.round(metres).toLocaleString('ru-RU'), unit: 'м' }
  return { value: Math.round(metres / 1000).toLocaleString('ru-RU'), unit: 'км' }
}
