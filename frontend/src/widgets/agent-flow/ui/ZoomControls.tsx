interface ZoomControlsProps {
  k: number
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

/** Масштаб холста: кнопки не участвуют в перетаскивании — события не всплывают к холсту. */
export function ZoomControls({ k, onZoomIn, onZoomOut, onFit }: ZoomControlsProps) {
  return (
    <div className="af-zoom" onPointerDown={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <button type="button" onClick={onZoomOut} aria-label="Отдалить" title="Отдалить (−)">
        −
      </button>
      <button type="button" onClick={onFit} className="af-zoom-value" title="Вписать граф в окно (0)">
        {Math.round(k * 100)}%
      </button>
      <button type="button" onClick={onZoomIn} aria-label="Приблизить" title="Приблизить (+)">
        +
      </button>
      <span className="af-zoom-sep" />
      <button type="button" onClick={onFit} aria-label="Вписать граф в окно" title="Вписать (0, двойной клик по фону)">
        <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true">
          <path d="M1.5 5V1.5H5M9 1.5h3.5V5M12.5 9v3.5H9M5 12.5H1.5V9" />
        </svg>
      </button>
      <span className="af-zoom-hint">тащите · колесо — масштаб</span>
    </div>
  )
}
