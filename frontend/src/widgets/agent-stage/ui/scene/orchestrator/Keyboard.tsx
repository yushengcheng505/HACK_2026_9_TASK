import { palette } from '@/shared/config/palette'
import { KEYBOARD } from '../../../model/computeHands'

const KEY_INDEXES = Array.from({ length: KEYBOARD.keyCount }, (_, key) => key)

interface KeyboardProps {
  pressedKey: number | null
}

export function Keyboard({ pressedKey }: KeyboardProps) {
  return (
    <>
      <rect x="88" y="266" width="224" height="38" rx="10" fill={palette.keyboard} stroke={palette.lineInput} className="pen-15" />
      {KEY_INDEXES.map((key) => {
        const pressed = key === pressedKey
        return (
          <rect
            key={key}
            x={KEYBOARD.firstKeyX + key * KEYBOARD.keyPitch}
            y={pressed ? KEYBOARD.keyY + KEYBOARD.pressDepth : KEYBOARD.keyY}
            width={KEYBOARD.keyWidth}
            height={pressed ? KEYBOARD.keyHeight - KEYBOARD.pressDepth : KEYBOARD.keyHeight}
            rx="2.5"
            fill={pressed ? palette.brand : palette.keyCap}
          />
        )
      })}
      <rect x="140" y="288" width="120" height="8" rx="3" fill={palette.keyCap} />
    </>
  )
}
