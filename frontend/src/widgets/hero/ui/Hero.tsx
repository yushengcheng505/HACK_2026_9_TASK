export function Hero() {
  return (
    <section className="flex flex-wrap items-end justify-between gap-6 pt-8 pb-9">
      <h1 className="m-0 max-w-[720px] font-display text-[clamp(30px,4vw,52px)] leading-[1.12] font-semibold tracking-[-0.01em]">
        Одна задача.
        <br />
        <span className="text-brand">Команда маленьких</span> AI-помощников.
      </h1>
      <p className="m-0 max-w-[400px] text-[17px] leading-[1.6] text-fg-muted">
        Ядро разбирает вашу задачу, раздаёт подзадачи агентам бумажными самолётиками, а потом собирает их
        ответы в один готовый результат.
      </p>
    </section>
  )
}
