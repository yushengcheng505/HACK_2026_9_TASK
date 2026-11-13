import type { FormEvent } from 'react'
import { Button } from '@/shared/ui/Button'

interface TaskFormProps {
  task: string
  onTaskChange: (task: string) => void
  onRun: () => void
}

export function TaskForm({ task, onTaskChange, onRun }: TaskFormProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    onRun()
  }

  return (
    <form id="task" onSubmit={submit} className="flex flex-wrap items-end gap-3 px-1.5 pt-[18px] pb-1">
      <div className="flex min-w-0 flex-[999_1_420px] flex-col gap-2">
        <label htmlFor="task-input" className="font-mono text-[12px] tracking-[0.1em] text-fg-dim uppercase">
          Задача для команды
        </label>
        <input
          id="task-input"
          type="text"
          value={task}
          onChange={(event) => onTaskChange(event.target.value)}
          className="min-h-[54px] w-full rounded-2xl border border-line-input bg-ink px-[18px] font-sans text-[16px] text-fg"
        />
      </div>
      <Button type="submit" size="block" className="flex-[1_1_200px]">
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
          <path d="M22 2 11 13" />
          <path d="M22 2 15 22 11 13 2 9 22 2z" />
        </svg>
        Запустить команду
      </Button>
    </form>
  )
}
