import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import type { Provider, ProviderInput } from '@/features/manage-providers'
import { JSON_MODES, createProvider, deleteProvider, listModels, listProviders, updateProvider } from '@/features/manage-providers'
import { AGENTS, AgentAvatar } from '@/entities/agent'

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

const cardClass = 'rounded-[28px] border border-line bg-surface shadow-[0_30px_80px_rgba(0,0,0,0.45)]'
const fieldClass =
  'min-h-12 w-full rounded-2xl border border-line-input bg-ink px-4 text-[14px] text-fg transition-colors duration-150 placeholder:text-fg-dim/60 focus:border-brand disabled:cursor-not-allowed disabled:opacity-60'
const labelClass = 'flex flex-col gap-2'
const captionClass = 'font-mono text-[12px] tracking-[0.1em] text-fg-dim uppercase'
const tagClass = 'rounded-full border border-line-strong px-2.5 py-0.5 font-mono text-[11px] text-fg-dim'

const initial = (name: string) => name.match(/[\p{L}\p{N}+]/u)?.[0] ?? '·'

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

  const working = saving || check.state === 'busy'
  const jsonLabel = JSON_MODES.find((m) => m.id === form.json_mode)?.label

  return (
    <div className="flex h-full flex-col overflow-y-auto bg-ink">
      <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3 px-8 pt-7 pb-6">
        <h1 className="m-0 font-display text-[clamp(26px,2.6vw,40px)] leading-[1.12] font-semibold tracking-[-0.01em]">
          Провайдеры и модели.
          <br />
          <span className="text-brand">Одна голова на всю команду.</span>
        </h1>
        <div className="flex flex-col items-start gap-3">
          <p className="m-0 max-w-[380px] text-[14px] leading-[1.6] text-fg-muted">
            Любой OpenAI-совместимый API. Модель выбирается на экране запуска и записывается в прогон.
          </p>
          <div className="flex items-center gap-1" aria-hidden="true">
            {AGENTS.map((agent) => (
              <AgentAvatar key={agent.id} id={agent.id} size={24} state={working ? 'working' : 'waiting'} />
            ))}
          </div>
        </div>
      </header>

      <div className="grid gap-6 px-8 pb-8 lg:grid-cols-[320px_minmax(0,1fr)] lg:items-start">
        <section className={`${cardClass} flex flex-col`} aria-labelledby="providers-title">
          <div className="flex items-baseline justify-between gap-4 px-6 pt-6 pb-4">
            <h2 id="providers-title" className="font-display text-[19px] font-semibold text-fg">
              Провайдеры
            </h2>
            <span className="font-mono text-[12px] text-fg-dim">{providers === null ? '…' : `${providers.length} шт.`}</span>
          </div>
          <nav className="flex flex-col gap-1.5 px-4 pb-6" aria-label="Провайдеры">
            {providers === null && <div className="h-32 animate-pulse rounded-[22px] border border-line bg-panel" />}
            {providers?.map((p) => {
              const active = p.id === selected
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => pick(p)}
                  className={`press flex cursor-pointer items-center gap-3 rounded-[18px] border px-3 py-2.5 text-left transition-[border-color,background-color,box-shadow] duration-150 ${
                    active
                      ? 'border-brand/70 bg-panel shadow-[0_0_0_1px_rgb(1_222_130/0.25),0_0_28px_rgb(1_222_130/0.08)]'
                      : 'border-transparent hover:border-line-strong hover:bg-panel'
                  }`}
                >
                  <ProviderMark name={p.name} size={32} active={active} />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-semibold text-fg">{p.name}</span>
                    <span className="truncate font-mono text-[11px] text-fg-dim">{p.default_model ?? 'модель не задана'}</span>
                  </span>
                  {p.builtin && <span className={`${tagClass} shrink-0`}>.env</span>}
                </button>
              )
            })}
            <button
              type="button"
              onClick={() => pick(null)}
              className={`press mt-2 flex cursor-pointer items-center gap-3 rounded-[18px] border border-dashed px-3 py-2.5 text-left font-mono text-[12px] transition-colors duration-150 ${
                selected === NEW ? 'border-brand text-brand' : 'border-line-input text-fg-dim hover:border-brand hover:text-brand'
              }`}
            >
              <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-current text-[14px]">
                +
              </span>
              провайдер
            </button>
          </nav>
        </section>

        <form onSubmit={submit} className={`${cardClass} flex flex-col gap-5 p-6`} aria-labelledby="provider-title">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <ProviderMark name={current?.name ?? (form.name || '+')} size={48} active />
            <div className="flex min-w-0 flex-col gap-0.5">
              <h2 id="provider-title" className="truncate font-display text-[19px] font-semibold text-fg">
                {current?.name ?? 'Новый провайдер'}
              </h2>
              <span className="truncate font-mono text-[12px] text-fg-dim">{current ? current.base_url : 'любой OpenAI-совместимый API'}</span>
            </div>
            <div className="ml-auto flex flex-wrap items-center gap-2">
              {current?.builtin && <span className="rounded-full bg-brand-deep px-2.5 py-0.5 font-mono text-[11px] font-bold text-brand">по умолчанию</span>}
              {current && !current.builtin && <span className={tagClass}>{current.has_key ? 'ключ сохранён' : 'без ключа'}</span>}
              {jsonLabel && <span className={tagClass}>{jsonLabel}</span>}
            </div>
          </div>

          {readOnly && (
            <p className="m-0 rounded-[22px] border border-line bg-panel px-5 py-3.5 text-[13px] leading-[1.6] text-fg-muted">
              Провайдер по умолчанию — меняется в <span className="font-mono text-fg-soft">backend/.env</span>.
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
            <div className="flex flex-wrap items-center gap-3 rounded-[22px] border border-line bg-panel px-4 py-3" aria-live="polite">
              <AgentAvatar id="analyst" size={32} state={check.state === 'busy' ? 'working' : check.state === 'ok' ? 'done' : 'waiting'} />
              <button
                type="button"
                onClick={() => runCheck(current.id)}
                disabled={check.state === 'busy'}
                className="press inline-flex min-h-9 cursor-pointer items-center rounded-full border border-line-input px-4 font-display text-[13px] font-semibold text-fg hover:border-brand hover:text-brand disabled:cursor-wait disabled:opacity-60"
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

          {error && (
            <p className="m-0 rounded-2xl border border-hazard/60 bg-hazard-deep/40 px-4 py-3 font-mono text-[13px] text-hazard">{error}</p>
          )}

          {!readOnly && (
            <div className="flex flex-wrap items-center gap-2.5 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-brand px-5 font-display text-[13px] font-semibold text-ink hover:bg-brand-hover disabled:cursor-wait disabled:opacity-60"
              >
                {saving ? 'Сохраняю…' : current ? 'Сохранить' : 'Добавить'}
              </button>
              {current?.has_key && (
                <button
                  type="button"
                  onClick={() => set('api_key', '')}
                  className="press inline-flex min-h-11 cursor-pointer items-center rounded-full border border-line-input px-5 font-display text-[13px] font-semibold text-fg-soft hover:border-amber hover:text-amber"
                >
                  {form.api_key === '' ? 'Ключ уберётся при сохранении' : 'Убрать ключ'}
                </button>
              )}
              {current && (
                <button
                  type="button"
                  onClick={remove}
                  className="press ml-auto inline-flex min-h-11 cursor-pointer items-center rounded-full px-5 font-display text-[13px] font-semibold text-fg-dim hover:text-hazard"
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

interface ProviderMarkProps {
  name: string
  size: number
  active: boolean
}

function ProviderMark({ name, size, active }: ProviderMarkProps) {
  return (
    <span
      aria-hidden="true"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}
      className={`grid shrink-0 place-items-center rounded-full border font-mono uppercase transition-colors duration-150 ${
        active ? 'border-brand/70 bg-brand-deep/60 text-brand' : 'border-line-strong bg-ink text-fg-dim'
      }`}
    >
      {initial(name)}
    </span>
  )
}
