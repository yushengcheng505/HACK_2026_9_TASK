/**
 * Геометрия графа агентов в пикселях «мира»: колонки слева направо, по ряду на историю.
 * Расстояния фиксированные и не зависят от размера окна — под экран граф подгоняет только масштаб,
 * поэтому на любом разрешении и масштабе браузера узлы стоят одинаково и не наезжают друг на друга.
 */

export const CARD = { w: 144, h: 150 } as const
export const CHIP = { w: 150, h: 48 } as const
export const GATE = { w: 30 } as const
export const RESULT = { w: 132, h: 150 } as const

const PAD = { left: 28, right: 28, top: 64, bottom: 76 } as const
/**
 * Расстояния между центрами соседних колонок. Между генераторами задач и ОТК — место под границу
 * двух групп, между рецензентами и Редактором стыков — под шину находок.
 */
const GAPS = [188, 188, 214, 124, 120, 224, 198, 198] as const
/** Коридор между Редактором стыков и Упрощателем: через него шина находок идёт к Скептику. */
const CORRIDOR = 56

export type Column = 'requirements' | 'analyst' | 'stories' | 'tasks' | 'gate' | 'reviewer' | 'side' | 'skeptic' | 'result'
const COLUMNS: Column[] = ['requirements', 'analyst', 'stories', 'tasks', 'gate', 'reviewer', 'side', 'skeptic', 'result']

export interface Box {
  x: number
  y: number
  w: number
  h: number
}

export interface Edge {
  id: string
  d: string
  /** Ключ экземпляра, в который ведёт ребро (по нему решаем, активно ли оно). */
  to: string
  from: string
  kind: 'flow' | 'loop' | 'gaps'
}

export interface FlowLayout {
  width: number
  height: number
  col: Record<Column, number>
  boxes: Record<string, Box>
  gate: Box
  rows: Record<string, number>
  bottom: number
  groups: { decomposition: Box; review: Box }
  edges: Edge[]
}

const left = (b: Box) => b.x - b.w / 2
const right = (b: Box) => b.x + b.w / 2
const top = (b: Box) => b.y - b.h / 2
const bottom = (b: Box) => b.y + b.h / 2

type Pt = [number, number]

/** Ломаная из горизонтальных и вертикальных участков со скруглёнными углами — как линии метро. */
function ortho(raw: Pt[], r = 14): string {
  const points = raw.filter((p, i) => i === 0 || p[0] !== raw[i - 1][0] || p[1] !== raw[i - 1][1])
  let d = `M ${points[0][0]} ${points[0][1]}`
  for (let i = 1; i < points.length - 1; i++) {
    const [px, py] = points[i - 1]
    const [x, y] = points[i]
    const [nx, ny] = points[i + 1]
    const rr = Math.min(r, Math.hypot(x - px, y - py) / 2, Math.hypot(nx - x, ny - y) / 2)
    if (rr < 0.5) {
      d += ` L ${x} ${y}`
      continue
    }
    d += ` L ${x - Math.sign(x - px) * rr} ${y - Math.sign(y - py) * rr} Q ${x} ${y} ${x + Math.sign(nx - x) * rr} ${y + Math.sign(ny - y) * rr}`
  }
  const [lx, ly] = points[points.length - 1]
  return `${d} L ${lx} ${ly}`
}

function curve(x1: number, y1: number, x2: number, y2: number): string {
  const dx = Math.max(24, (x2 - x1) * 0.5)
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`
}


/** Ширина мира: от левого края карточки Составителя до правого края Итога. */
export const FLOW_WIDTH = PAD.left + CARD.w / 2 + GAPS.reduce((a, b) => a + b, 0) + RESULT.w / 2 + PAD.right

/** Высота мира: растёт с числом историй. */
export const flowHeight = (stories: number) => Math.max(stories * 62 + 330, 600)

export function layoutFlow(storyIds: string[]): FlowLayout {
  const width = FLOW_WIDTH
  const height = flowHeight(storyIds.length)
  const col = {} as Record<Column, number>
  let x = PAD.left + CARD.w / 2
  COLUMNS.forEach((c, i) => {
    col[c] = x
    if (i < GAPS.length) x += GAPS[i]
  })

  const areaTop = PAD.top
  const areaBottom = height - PAD.bottom
  const mid = (areaTop + areaBottom) / 2
  const n = Math.max(storyIds.length, 1)
  const step = Math.min(62, (areaBottom - areaTop - CHIP.h) / Math.max(n - 1, 1))
  const rows: Record<string, number> = {}
  storyIds.forEach((id, i) => {
    rows[id] = mid + (i - (storyIds.length - 1) / 2) * step
  })

  const boxes: Record<string, Box> = {
    requirements: { x: col.requirements, y: mid, w: CARD.w, h: CARD.h },
    analyst: { x: col.analyst, y: mid, w: CARD.w, h: CARD.h },
    stories: { x: col.stories, y: mid, w: CARD.w, h: CARD.h },
    junction: { x: col.side, y: mid - CORRIDOR / 2 - CARD.h / 2, w: CARD.w, h: CARD.h },
    simplifier: { x: col.side, y: mid + CORRIDOR / 2 + CARD.h / 2, w: CARD.w, h: CARD.h },
    skeptic: { x: col.skeptic, y: mid, w: CARD.w, h: CARD.h },
    result: { x: col.result, y: mid, w: RESULT.w, h: RESULT.h },
  }
  for (const id of storyIds) {
    boxes[`tasks:${id}`] = { x: col.tasks, y: rows[id], w: CHIP.w, h: CHIP.h }
    boxes[`review:${id}`] = { x: col.reviewer, y: rows[id], w: CHIP.w, h: CHIP.h }
  }

  const spread = storyIds.length ? (storyIds.length - 1) * step : 0
  const gateH = Math.max(spread + CHIP.h + 36, 230)
  const gate = { x: col.gate, y: mid, w: GATE.w, h: gateH }

  const edges: Edge[] = []
  const flow = (id: string, from: string, to: string, d: string) => edges.push({ id, from, to, d, kind: 'flow' })
  const req = boxes.requirements
  const sk = boxes.skeptic
  const jn = boxes.junction
  const sp = boxes.simplifier
  flow('prep', 'prep', 'requirements', `M ${req.x} 0 C ${req.x} ${areaTop * 0.6}, ${req.x} ${top(req) - 30}, ${req.x} ${top(req)}`)
  flow('req-an', 'requirements', 'analyst', curve(right(req), mid, left(boxes.analyst), mid))
  flow('an-st', 'analyst', 'stories', curve(right(boxes.analyst), mid, left(boxes.stories), mid))

  // Входная шина генераторов: от Автора историй вертикаль перед колонкой, от неё ветка в каждый ряд.
  // По этой же шине возвращается доработка от Скептика — линии не пересекаются.
  const fanX = col.tasks - CHIP.w / 2 - 26
  // Шина находок: рецензенты сливаются в вертикаль справа от себя, она идёт по коридору к Скептику.
  const busX = (col.reviewer + CHIP.w / 2 + left(jn)) / 2
  const bus2X = (right(jn) + left(sk)) / 2
  for (const id of storyIds) {
    const gen = boxes[`tasks:${id}`]
    const rev = boxes[`review:${id}`]
    flow(`st-gen:${id}`, 'stories', `tasks:${id}`, ortho([[right(boxes.stories), mid], [fanX, mid], [fanX, gen.y], [left(gen), gen.y]]))
    flow(`gen-gate:${id}`, `tasks:${id}`, 'gate', `M ${right(gen)} ${gen.y} L ${left(gate)} ${gen.y}`)
    flow(`gate-rev:${id}`, 'gate', `review:${id}`, `M ${right(gate)} ${rev.y} L ${left(rev)} ${rev.y}`)
    flow(`rev-sk:${id}`, `review:${id}`, 'skeptic', ortho([[right(rev), rev.y], [busX, rev.y], [busX, mid], [left(sk), mid]]))
  }

  // Стыки и упрощатель получают весь эпик от ОТК по линиям над и под рецензентами — не пересекая их ряды.
  const firstTop = storyIds.length ? boxes[`review:${storyIds[0]}`].y - CHIP.h / 2 - 44 : Infinity
  const lastBottom = storyIds.length ? boxes[`review:${storyIds[storyIds.length - 1]}`].y + CHIP.h / 2 + 30 : -Infinity
  const yAbove = Math.min(firstTop, top(gate) - 22, top(jn) - 26)
  const yBelow = Math.max(lastBottom, bottom(gate) + 22, bottom(sp) + 26)
  flow('gate-junction', 'gate', 'junction', ortho([[gate.x, top(gate)], [gate.x, yAbove], [jn.x, yAbove], [jn.x, top(jn)]]))
  flow('gate-simplifier', 'gate', 'simplifier', ortho([[gate.x, bottom(gate)], [gate.x, yBelow], [sp.x, yBelow], [sp.x, bottom(sp)]]))
  flow('junction-sk', 'junction', 'skeptic', ortho([[right(jn), jn.y], [bus2X, jn.y], [bus2X, mid], [left(sk), mid]]))
  flow('simplifier-sk', 'simplifier', 'skeptic', ortho([[right(sp), sp.y], [bus2X, sp.y], [bus2X, mid], [left(sk), mid]]))
  flow('sk-result', 'skeptic', 'result', curve(right(sk), mid, left(boxes.result), mid))

  // Пробелы аналитика и петля доработки идут вплотную над и под узлами, а не по краям холста.
  const an = boxes.analyst
  const lane = yAbove - 24
  edges.push({
    id: 'an-sk',
    from: 'analyst',
    to: 'skeptic',
    kind: 'gaps',
    d: ortho([[an.x, top(an)], [an.x, lane], [sk.x, lane], [sk.x, top(sk)]]),
  })

  const groupTop = lane - 40
  const groupBottom = yBelow + 20
  const loopBottom = groupBottom + 22
  for (const id of storyIds) {
    const gen = boxes[`tasks:${id}`]
    edges.push({
      id: `loop:${id}`,
      from: 'skeptic',
      to: `tasks:${id}`,
      kind: 'loop',
      d: ortho([[sk.x, bottom(sk)], [sk.x, loopBottom], [fanX, loopBottom], [fanX, gen.y], [left(gen), gen.y]]),
    })
  }

  const decoLeft = left(req) - 14
  const reviewLeft = col.gate - GATE.w / 2 - 10
  const decoRight = Math.min(col.tasks + CHIP.w / 2 + 14, reviewLeft - 8)
  const reviewRight = right(sk) + 14
  const groups = {
    decomposition: { x: (decoLeft + decoRight) / 2, y: (groupTop + groupBottom) / 2, w: decoRight - decoLeft, h: groupBottom - groupTop },
    review: { x: (reviewLeft + reviewRight) / 2, y: (groupTop + groupBottom) / 2, w: reviewRight - reviewLeft, h: groupBottom - groupTop },
  }

  return { width, height, col, boxes, gate, rows, bottom: loopBottom, groups, edges }
}
