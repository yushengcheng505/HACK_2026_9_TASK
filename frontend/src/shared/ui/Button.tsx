import type { ButtonHTMLAttributes } from 'react'

type ButtonVariant = 'primary' | 'ghost'
type ButtonSize = 'pill' | 'block'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
}

const base = 'inline-flex cursor-pointer items-center justify-center'

const variants: Record<ButtonVariant, string> = {
  primary: 'border-0 bg-brand text-ink hover:bg-brand-hover',
  ghost: 'border border-line-input bg-transparent text-fg hover:border-brand hover:text-brand',
}

const sizes: Record<ButtonSize, string> = {
  pill: 'min-h-11 rounded-full px-[18px] font-sans text-[14px]',
  block: 'min-h-[54px] gap-2.5 rounded-2xl px-6 font-display text-[15px] font-semibold',
}

const pillWeight: Record<ButtonVariant, string> = {
  primary: 'font-bold',
  ghost: 'font-semibold',
}

export function Button({
  variant = 'primary',
  size = 'pill',
  type = 'button',
  className = '',
  ...rest
}: ButtonProps) {
  const weight = size === 'pill' ? pillWeight[variant] : ''
  return (
    <button
      type={type}
      className={[base, variants[variant], sizes[size], weight, className].join(' ')}
      {...rest}
    />
  )
}
