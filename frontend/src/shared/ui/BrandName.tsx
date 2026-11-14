interface BrandNameProps {
  className?: string
}

/** Название проекта как в трейлере: «SY» светлым, «NAPS» — фирменным зелёным. */
export function BrandName({ className = '' }: BrandNameProps) {
  return (
    <span className={`font-display font-extrabold tracking-[-0.01em] text-fg ${className}`}>
      SY<span className="text-brand [text-shadow:0_0_14px_rgba(1,222,130,0.45)]">NAPS</span>
    </span>
  )
}
