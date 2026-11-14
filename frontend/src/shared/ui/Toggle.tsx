interface ToggleProps {
  checked: boolean
  onChange: (checked: boolean) => void
  label: string
}

export function Toggle({ checked, onChange, label }: ToggleProps) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-3 select-none">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span
        aria-hidden="true"
        className="relative h-6 w-11 shrink-0 rounded-full border border-line-input bg-ink transition-colors duration-150 peer-checked:border-brand peer-checked:bg-brand-deep peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-brand after:absolute after:top-[3px] after:left-[3px] after:size-4 after:rounded-full after:bg-fg-dim after:transition-transform after:duration-200 after:ease-[cubic-bezier(0.23,1,0.32,1)] peer-checked:after:translate-x-5 peer-checked:after:bg-brand"
      />
      <span className="text-[13px] text-fg-muted">{label}</span>
    </label>
  )
}
