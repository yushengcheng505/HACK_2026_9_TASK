"""Мини-бенчмарк проверяющих агентов.

  uv run python -m bench e2e    --out bench/results/<метка> [--repeats 2] [--parallel 4] [--variants a,b]
  uv run python -m bench review --out bench/results/<метка> [--bases A,B] [--repeats 2] [--parallel 4] [--extended]
  uv run python -m bench report --out bench/results/<метка>

Модель и ключ — из обычных настроек (LLM_BASE_URL, LLM_MODEL, LLM_API_KEY_ENV…). Готовые прогоны
не повторяются: можно прервать и запустить снова.
"""

import argparse
import asyncio
import copy
import json
from pathlib import Path
from statistics import mean

from app.demos import load_demo
from app.graph import encode_files

from bench.bases import base_state
from bench.harness import VARIANTS, provider_failed, run_graph, variant_llm
from bench.mutations import mutate
from bench.score import score_e2e, score_review

BASES = ["affbf77db561", "8ed2ce672494"]


def _save(path: Path, data: dict) -> None:
    if provider_failed(data["run"].get("error") or ""):
        print(f"! {path.stem}: провайдер перегружен, прогон не сохранён — повторите команду", flush=True)
        return
    path.write_text(json.dumps(data, ensure_ascii=False, indent=1), encoding="utf-8")


async def _jobs(jobs, parallel: int) -> None:
    """Готовые (есть .json) и уже идущие в другом процессе (есть .running) прогоны пропускаются."""
    semaphore = asyncio.Semaphore(parallel)

    async def guarded(path: Path, job):
        async with semaphore:
            marker = path.with_suffix(".running")
            if path.exists() or marker.exists():
                return
            marker.touch()
            print(f"→ {path.stem}", flush=True)
            try:
                await job()
                print(f"✓ {path.stem}", flush=True)
            finally:
                marker.unlink(missing_ok=True)

    await asyncio.gather(*(guarded(path, job) for path, job in jobs))


async def e2e(out: Path, repeats: int, parallel: int, variants: list[str]) -> None:
    llms = {v: variant_llm(v, out) for v in variants}
    demo = load_demo("boutique-delivery")
    payload = {"title": demo.title, "epic_text": demo.epic_text, "files": encode_files(demo.files),
               "skip_questions": True}
    jobs = []
    for n in range(1, repeats + 1):
        for v in variants:
            path = out / f"e2e-{v}-{n}.json"
            if path.exists():
                continue

            async def job(v=v, path=path):
                run = await run_graph(llms[v], VARIANTS[v], payload=copy.deepcopy(payload))
                _save(path, {"kind": "e2e", "variant": v, "score": score_e2e(run), "run": run})

            jobs.append((path, job))
    await _jobs(jobs, parallel)


async def review(out: Path, repeats: int, parallel: int, variants: list[str], bases: list[str],
                 extended: bool = False) -> None:
    llms = {v: variant_llm(v, out) for v in variants}
    jobs = []
    for base in bases:
        clean = base_state(base)
        mutated = copy.deepcopy(clean)
        mutations = mutate(mutated, base, extended)
        for state_name, state, muts in (("defects", mutated, mutations), ("control", clean, [])):
            for n in range(1, repeats + 1):
                for v in variants:
                    path = out / f"review-{base}-{state_name}-{v}-{n}.json"
                    if path.exists():
                        continue

                    async def job(v=v, path=path, state=state, muts=muts, base=base, state_name=state_name):
                        run = await run_graph(llms[v], VARIANTS[v], base_state=copy.deepcopy(state))
                        _save(path, {"kind": "review", "variant": v, "base": base, "state": state_name,
                                     "extended": extended,
                                     "mutations": [{"id": m.id, "title": m.title, "story_id": m.story_id}
                                                   for m in muts],
                                     "score": score_review(run, muts, state), "run": run})

                    jobs.append((path, job))
    await _jobs(jobs, parallel)


# ---------- отчёт ----------

def _starts() -> dict:
    """Стартовые состояния и дефекты по основам — детерминированы, поэтому оценки можно пересчитать."""
    starts = {}
    for base in BASES:
        clean = base_state(base)
        for extended in (False, True):
            mutated = copy.deepcopy(clean)
            starts[(base, "defects", extended)] = (mutated, mutate(mutated, base, extended))
            starts[(base, "control", extended)] = (clean, [])
    return starts


def _load(out: Path, kind: str, rescore: bool = True) -> list[dict]:
    """Результаты прогонов; оценки круга проверки пересчитываются текущими проверками дефектов."""
    rows, starts = [], (_starts() if kind == "review" and rescore else {})
    for p in sorted(out.glob(f"{kind}-*.json")):
        data = json.loads(p.read_text(encoding="utf-8"))
        run = data.pop("run", None)
        if kind == "e2e" and rescore and run is not None:
            data["score"] = score_e2e(run)
        key = (data.get("base"), data.get("state"), data.get("extended", False))
        if starts and run is not None and key in starts:
            state, muts = starts[key]
            data["score"] = score_review(run, muts, state)
        rows.append(data)
    return rows


def _avg(values) -> str:
    values = [v for v in values if v is not None]
    return f"{mean(values):.1f}" if values else "—"


def _rate(flags) -> str:
    flags = list(flags)
    return f"{sum(flags)}/{len(flags)}" if flags else "—"


def _present(rows: list[dict]) -> list[str]:
    """Варианты из прогонов: сначала известные в порядке VARIANTS, затем прежние, которых в списке уже нет."""
    seen = list(dict.fromkeys(r["variant"] for r in rows))
    return [v for v in VARIANTS if v in seen] + [v for v in seen if v not in VARIANTS]


def report(out: Path) -> str:
    lines = [f"# Мини-бенчмарк проверяющих агентов — `{out.name}`", ""]
    e2e_rows = _load(out, "e2e")
    if e2e_rows:
        lines += ["## Этап 2: полные прогоны демо-эпика", "",
                  "| вариант | прогонов | мин | вызовов | повторов | рассужд., тыс. симв. | вход, тыс. симв. | историй | задач | "
                  "пробелов | противоречие 15 мин сохранено | ошибок кода | кандидатов в дубли | нерешённых | не проверено |",
                  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for v in _present(e2e_rows):
            rs = [r["score"] for r in e2e_rows if r["variant"] == v]
            if not rs:
                continue
            ok = [r for r in rs if not r.get("error") and "tasks" in r]
            lines.append("| " + " | ".join([
                v, f"{len(ok)}/{len(rs)}", _avg(r["seconds"] / 60 for r in rs), _avg(r["calls"] for r in rs),
                _avg(r["retries"] for r in rs), _avg(r["reasoning_kchars"] for r in rs),
                _avg(r["input_kchars"] for r in rs), _avg(r.get("stories") for r in ok), _avg(r.get("tasks") for r in ok),
                _avg(r.get("gaps") for r in ok), _rate(r.get("contradiction_kept") for r in ok),
                _avg(r.get("code_errors") for r in ok), _avg(r.get("dup_candidates") for r in ok),
                _avg(r.get("unresolved") for r in ok), _avg(r.get("review_skipped") for r in ok)]) + " |")
        lines.append("")

    rev = _load(out, "review")
    if rev:
        defects = [r for r in rev if r["state"] == "defects"]
        variants = _present(rev)
        mutation_ids = sorted({m["id"] for r in defects for m in r["mutations"]})
        titles = {m["id"]: m["title"] for r in defects for m in r["mutations"]}
        lines += ["## Этапы 3–4: специальные проблемы в круге проверки", "",
                  "Ячейка: найдено / исправлено (по всем основам и повторам). Для `review*` в скобках — "
                  "сколько раз дефект был поднят хоть одной ролью, даже если находку отсеяли.", "",
                  "| дефект | " + " | ".join(variants) + " |", "|---|" + "---|" * len(variants)]
        for mid in mutation_ids:
            cells = []
            for v in variants:
                ds = [r["score"]["defects"][mid] for r in defects if r["variant"] == v and mid in r["score"]["defects"]]
                if not ds:
                    cells.append("—")
                    continue
                cell = f"{_rate(d['detected'] for d in ds)} / {_rate(d['fixed'] for d in ds)}"
                if v != "critic":
                    cell += f" ({_rate(d['raised'] for d in ds)})"
                cells.append(cell)
            lines.append(f"| {mid} {titles[mid]} | " + " | ".join(cells) + " |")
        lines.append("")
        lines += ["| вариант | состояние | прогонов | найдено | исправлено | мин | вызовов | повторов | "
                  "переделано историй | удалено кодом не по дефектам | задач до → после | Δ непокрытых требований | "
                  "Δ ошибок кода | находок / подтверждено |",
                  "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
        for v in variants:
            for state in ("defects", "control"):
                rs = [r["score"] for r in rev if r["variant"] == v and r["state"] == state]
                if not rs:
                    continue
                ds = [d for r in rs for d in r["defects"].values()]
                lines.append("| " + " | ".join([
                    v, state, f"{sum(not r.get('error') for r in rs)}/{len(rs)}",
                    _rate(d["detected"] for d in ds) if ds else "—", _rate(d["fixed"] for d in ds) if ds else "—",
                    _avg(r["seconds"] / 60 for r in rs), _avg(r["calls"] for r in rs), _avg(r["retries"] for r in rs),
                    _avg(len(r["redone_stories"]) for r in rs), _avg(len(r["removed_other"]) for r in rs),
                    f"{_avg(r['tasks_before'] for r in rs)} → {_avg(r['tasks_after'] for r in rs)}",
                    _avg(r["uncovered_delta"] for r in rs), _avg(r["errors_delta"] for r in rs),
                    f"{_avg(r['findings'] for r in rs)} / {_avg(r['confirmed'] for r in rs)}"]) + " |")
        lines.append("")
    text = "\n".join(lines)
    (out / "report.md").write_text(text, encoding="utf-8")
    return text


def main() -> None:
    parser = argparse.ArgumentParser(prog="bench")
    parser.add_argument("command", choices=["e2e", "review", "report"])
    parser.add_argument("--out", type=Path, required=True)
    parser.add_argument("--repeats", type=int, default=2)
    parser.add_argument("--parallel", type=int, default=4)
    parser.add_argument("--variants", default=",".join(VARIANTS))
    parser.add_argument("--bases", default=",".join(BASES))
    parser.add_argument("--extended", action="store_true", help="добавить дефекты M8–M9")
    args = parser.parse_args()
    args.out.mkdir(parents=True, exist_ok=True)
    variants = args.variants.split(",")
    if args.command == "e2e":
        asyncio.run(e2e(args.out, args.repeats, args.parallel, variants))
    elif args.command == "review":
        asyncio.run(review(args.out, args.repeats, args.parallel, variants, args.bases.split(","), args.extended))
    print(report(args.out))


if __name__ == "__main__":
    main()
