import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Provider, ProviderInput } from '@/features/manage-providers'
import { JSON_MODES, createProvider, deleteProvider, listModels, listProviders, updateProvider } from '@/features/manage-providers'
import { SectionHeader } from '@/shared/ui/SectionHeader'

const NEW = 'new'

const blank: ProviderInput = {
  name: '',
  base_url: '',
  api_key: null,
  api_key_env: null,
  json_mode: 'json_schema',
  default_model: null,
}

const toInput = (p: Provider): ProviderInput => ({
  name: p.name,
  base_url: p.base_url,
  api_key: null,
  api_key_env: p.api_key_env,
  json_mode: p.json_mode,
  default_model: p.default_model,
})

const fieldClass =
  'w-full rounded-xl border border-line-input bg-ink px-3.5 py-2.5 text-[14px] text-fg placeholder:text-fg-dim/60 focus:border-brand disabled:opacity-60'
const labelClass = 'flex flex-col gap-1.5'
const captionClass = 'font-mono text-[11px] tracking-[0.1em] text-fg-dim uppercase'

type Check = { state: 'idle' } | { state: 'busy' } | { state: 'ok'; models: string[] } | { state: 'error'; message: string }

export function ModelsPanel() {
  const [providers, setProviders] = useState<Provider[] | null>(null)
  const [selected, setSelected] = useState<string>('env')
  const [form, setForm] = useState<ProviderInput>(blank)
  const [check, setCheck] = useState<Check>({ state: 'idle' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const current = providers?.find((p) => p.id === selected) ?? null
  const readOnly = current?.builtin ?? false

  const pick = (p: Provider | null) => {
    setSelected(p?.id ?? NEW)
    setForm(p ? toInput(p) : blank)
    setCheck({ state: 'idle' })
    setError(null)
  }

  const load = (id: string) =>
    listProviders().then((list) => {
      setProviders(list)
      const next = list.find((p) => p.id === id) ?? list[0]
      setSelected(next?.id ?? NEW)
      setForm(next ? toInput(next) : blank)
      setCheck({ state: 'idle' })
    })

  useEffect(() => {
    listProviders()
      .then((list) => {
        setProviders(list)
        if (list[0]) {
          setSelected(list[0].id)
          setForm(toInput(list[0]))
        }
      })
      .catch((e: Error) => setError(e.message))
  }, [])

  const runCheck = (id: string) => {
    setCheck({ state: 'busy' })
    listModels(id)
      .then((models) => setCheck({ state: 'ok', models }))
      .catch((e: Error) => setCheck({ state: 'error', message: e.message }))
  }

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const body = { ...form, api_key_env: form.api_key_env?.trim() || null, default_model: form.default_model?.trim() || null }
      const saved = current && !current.builtin ? await updateProvider(current.id, body) : await createProvider(body)
      await load(saved.id)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const remove = async () => {
    if (!current || current.builtin) return
    setError(null)
    try {
      await deleteProvider(current.id)
      await load('env')
    } catch (e) {
      setError((e as Error).message)
    }
  }

  const set = <K extends keyof ProviderInput>(key: K, value: ProviderInput[K]) => setForm((f) => ({ ...f, [key]: value }))
  const models = check.state === 'ok' ? check.models : []

  return (
    <div className="flex h-full flex-col overflow-y-auto">
      <SectionHeader index="03" kicker="Модели" title="Провайдеры и модели">
        <span className="max-w-[360px] text-[13px] leading-relaxed text-fg-dim">
          Любой OpenAI-совместимый API. Модель выбирается на экране запуска и записывается в прогон.
        </span>
      </SectionHeader>

      <div className="grid gap-6 px-8 py-6 lg:grid-cols-[280px_minmax(0,1fr)]">
        <nav className="flex flex-col gap-2" aria-label="Провайдеры">
          {providers === null && <div className="h-16 animate-pulse rounded-xl border border-line bg-panel" />}
          {providers?.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => pick(p)}
              className={`press flex cursor-pointer flex-col items-start gap-1 rounded-xl border px-4 py-3 text-left transition-colors duration-150 ${
                p.id === selected ? 'border-brand/70 bg-brand-deep/25' : 'border-line bg-surface hover:border-line-strong'
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className="truncate text-[14px] font-semibold text-fg">{p.name}</span>
                {p.builtin && <span className="font-mono text-[10px] text-fg-dim">.env</span>}
              </span>
              <span className="w-full truncate font-mono text-[11px] text-fg-dim">{p.default_model ?? 'модель не задана'}</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => pick(null)}
            className={`press cursor-pointer rounded-xl border border-dashed px-4 py-3 text-left font-mono text-[12px] transition-colors duration-150 ${
              selected === NEW ? 'border-brand text-brand' : 'border-line-input text-fg-dim hover:border-brand hover:text-brand'
            }`}
          >
            + провайдер
          </button>
        </nav>

        <form onSubmit={submit} className="flex max-w-[720px] flex-col gap-4 rounded-xl border border-line bg-surface p-6">
          {readOnly && (
            <p className="rounded-lg bg-panel px-3.5 py-2.5 text-[13px] text-fg-muted">
              Провайдер по умолчанию — меняется в <span className="font-mono">backend/.env</span>.
            </p>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <label className={labelClass}>
              <span className={captionClass}>Название</span>
              <input required disabled={readOnly} value={form.name} onChange={(e) => set('name', e.target.value)} placeholder="OpenRouter" className={fieldClass} />
            </label>
            <label className={labelClass}>
              <span className={captionClass}>Адрес API</span>
              <input
                required
                disabled={readOnly}
                value={form.base_url}
                onChange={(e) => set('base_url', e.target.value)}
                placeholder="https://…/v1"
                className={`${fieldClass} font-mono text-[13px]`}
              />
            </label>
            {!readOnly && (
              <label className={labelClass}>
                <span className={captionClass}>Ключ</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={form.api_key ?? ''}
                  onChange={(e) => set('api_key', e.target.value || null)}
                  placeholder={current?.has_key ? 'сохранён — оставьте пустым' : 'sk-…'}
                  className={`${fieldClass} font-mono text-[13px]`}
                />
              </label>
            )}
            {!readOnly && (
              <label className={labelClass}>
                <span className={captionClass}>или переменная окружения</span>
                <input
                  value={form.api_key_env ?? ''}
                  onChange={(e) => set('api_key_env', e.target.value || null)}
                  placeholder="OPENROUTER_API_KEY"
                  className={`${fieldClass} font-mono text-[13px]`}
                />
              </label>
            )}
            <label className={labelClass}>
              <span className={captionClass}>Режим JSON</span>
              <select disabled={readOnly} value={form.json_mode} onChange={(e) => set('json_mode', e.target.value as ProviderInput['json_mode'])} className={fieldClass}>
                {JSON_MODES.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={labelClass}>
              <span className={captionClass}>Модель по умолчанию</span>
              <input
                disabled={readOnly}
                list="provider-models"
                value={form.default_model ?? ''}
                onChange={(e) => set('default_model', e.target.value || null)}
                placeholder="gpt-4.1-mini"
                className={`${fieldClass} font-mono text-[13px]`}
              />
              <datalist id="provider-models">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </label>
          </div>

          {current && (
            <div className="flex flex-wrap items-center gap-3 rounded-lg bg-panel px-3.5 py-2.5" aria-live="polite">
              <button
                type="button"
                onClick={() => runCheck(current.id)}
                disabled={check.state === 'busy'}
                className="press cursor-pointer rounded-full border border-line-input px-3.5 py-1.5 font-mono text-[12px] text-fg-soft hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60"
              >
                {check.state === 'busy' ? 'проверяю…' : 'Проверить'}
              </button>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">
                {check.state === 'ok' && <span className="text-brand">отвечает · моделей: {check.models.length}</span>}
                {check.state === 'error' && <span className="text-hazard">{check.message}</span>}
                {check.state === 'idle' && <span className="text-fg-dim">запросит список моделей у провайдера</span>}
              </span>
            </div>
          )}

          {error && <p className="font-mono text-[12px] text-hazard">{error}</p>}

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="press cursor-pointer rounded-full bg-brand px-5 py-2.5 font-display text-[13px] font-semibold text-ink hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? 'Сохраняю…' : current ? 'Сохранить' : 'Добавить'}
              </button>
              {current?.has_key && (
                <button
                  type="button"
                  onClick={() => set('api_key', '')}
                  className="press cursor-pointer rounded-full border border-line-input px-4 py-2.5 text-[13px] text-fg-soft hover:border-amber hover:text-amber"
                >
                  {form.api_key === '' ? 'Ключ уберётся при сохранении' : 'Убрать ключ'}
                </button>
              )}
              {current && (
                <button
                  type="button"
                  onClick={remove}
                  className="press ml-auto cursor-pointer rounded-full px-4 py-2.5 text-[13px] text-fg-dim hover:text-hazard"
                >
                  Удалить
                </button>
              )}
            </div>
          )}
        </form>
      </div>
    </div>
  )
}
