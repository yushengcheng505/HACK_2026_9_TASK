export const KEYBOARD = {
  firstKeyX: 100,
  keyPitch: 20.5,
  keyWidth: 15,
  keyCount: 10,
  keyY: 273,
  keyHeight: 10,
  pressDepth: 2,
} as const

const STROKES_PER_SECOND = 7
const HAND_UP_Y = 256
const HAND_DOWN_Y = 265
const SHOULDER = { left: 128, right: 272, y: 240 } as const
const ARM_BEND = 14
/** Доля удара, за которую палец опускается и поднимается обратно. */
const PRESS_SHARE = 0.6
/** Насколько должен опуститься палец, чтобы клавиша считалась нажатой. */
const PRESS_THRESHOLD = 0.65
const IDLE_KEYS = { left: 2, right: 7 } as const

export interface HandPose {
  x: number
  y: number
  armPath: string
}

export interface HandsPose {
  left: HandPose
  right: HandPose
  pressedKey: number | null
}

const keyCenterX = (key: number) =>
  KEYBOARD.firstKeyX + KEYBOARD.keyWidth / 2 + key * KEYBOARD.keyPitch

const mod = (value: number, base: number) => ((value % base) + base) % base

function armPath(shoulderX: number, x: number, y: number, bend: number) {
  const controlX = (shoulderX + x) / 2 + bend
  return `M ${shoulderX} ${SHOULDER.y} Q ${controlX.toFixed(1)} ${(y - 2).toFixed(1)} ${x.toFixed(1)} ${(y - 4).toFixed(1)}`
}

/** Руки по очереди бьют по клавишам: левая — по клавишам 0–4, правая — по 5–9. */
export function computeHands(time: number, typing: boolean): HandsPose {
  const strokes = time * STROKES_PER_SECOND
  const stroke = Math.floor(strokes)
  const strokePhase = strokes - stroke
  const leftActive = stroke % 2 === 0
  const leftStroke = leftActive ? stroke : stroke - 1
  const rightStroke = leftActive ? stroke - 1 : stroke

  const leftKey = typing ? mod(leftStroke * 7 + 3, 5) : IDLE_KEYS.left
  const rightKey = typing ? 5 + mod(rightStroke * 3 + 1, 5) : IDLE_KEYS.right
  const press = typing ? Math.sin(Math.PI * Math.min(strokePhase / PRESS_SHARE, 1)) : 0
  const pressedY = HAND_UP_Y + (HAND_DOWN_Y - HAND_UP_Y) * press

  const leftX = keyCenterX(leftKey)
  const rightX = keyCenterX(rightKey)
  const leftY = typing && leftActive ? pressedY : HAND_UP_Y
  const rightY = typing && !leftActive ? pressedY : HAND_UP_Y

  return {
    left: { x: leftX, y: leftY, armPath: armPath(SHOULDER.left, leftX, leftY, -ARM_BEND) },
    right: { x: rightX, y: rightY, armPath: armPath(SHOULDER.right, rightX, rightY, ARM_BEND) },
    pressedKey: typing && press > PRESS_THRESHOLD ? (leftActive ? leftKey : rightKey) : null,
  }
}
