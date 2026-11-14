interface TaskPreviewProps {
  task: string
}

/** Строка задачи — часть демонстрации, а не поле ввода; настоящий запуск — в консоли. */
export function TaskPreview({ task }: TaskPreviewProps) {
  return (
    <div className="flex flex-wrap items-end gap-3 px-1.5 pt-[18px] pb-1">
      <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-2">
        <span className="font-mono text-[12px] tracking-[0.1em] text-fg-dim uppercase">Задача для команды</span>
        <div className="flex min-h-[54px] w-full cursor-default items-center rounded-2xl border border-line-input bg-ink px-[18px] font-sans text-[16px] text-fg select-none">
          <span className="truncate">{task}</span>
        </div>
      </div>
      <a
        href="/console/"
        className="inline-flex min-h-[54px] flex-[1_1_200px] items-center justify-center gap-2.5 rounded-2xl bg-brand px-6 font-display text-[15px] font-semibold whitespace-nowrap text-ink hover:bg-brand-hover"
      >
        Попробуй сам
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M5 12h14" />
          <path d="m13 6 6 6-6 6" />
        </svg>
      </a>
    </div>
  )
}
