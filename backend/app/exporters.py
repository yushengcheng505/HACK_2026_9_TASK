"""Выгрузка декомпозиции: JSON (канонический, со статистикой), XLSX, DOCX."""

import io

from docx import Document
from docx.enum.table import WD_TABLE_ALIGNMENT
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Pt, RGBColor
from openpyxl import Workbook
from openpyxl.styles import Alignment, Font, PatternFill
from openpyxl.utils import get_column_letter

from app.schemas import Decomposition, Story, Task

BRAND = "0B5CAD"
STORY_FILL = "DCE8F7"
STORY_SHEET = "Истории и задачи"
STORY_COLUMNS = ["Вид", "ID", "Родитель", "Заголовок", "Тип задачи", "Описание",
                 "Критерии приёмки / DoD", "Требования", "Источники", "Тест-сценарии"]
SEVERITY = {"error": "Ошибка", "warning": "Предупреждение", "info": "Инфо"}
REQ_TYPES = {"functional": "Функциональное", "integration": "Интеграционное", "nonfunctional": "Нефункциональное"}


def to_json(d: Decomposition) -> bytes:
    return d.model_dump_json(indent=2).encode("utf-8")


def _lines(items: list[str]) -> str:
    return "\n".join(f"• {i}" for i in items)


def _default(q) -> str:
    return q.options[q.recommended] if 0 <= q.recommended < len(q.options) else "—"


def _scenarios(task: Task) -> str:
    return "\n".join(f"{s.name}: {s.input} → {s.expected}" for s in task.test_scenarios)


def _sheet(wb: Workbook, title: str, header: list[str], rows: list[list], widths: list[int], first: bool = False):
    ws = wb.active if first else wb.create_sheet()
    ws.title = title
    ws.append(header)
    for row in rows:
        ws.append(row)
    for cell in ws[1]:
        cell.font = Font(bold=True, color="FFFFFF")
        cell.fill = PatternFill("solid", fgColor=BRAND)
        cell.alignment = Alignment(vertical="center", wrap_text=True)
    for row in ws.iter_rows(min_row=2):
        for cell in row:
            cell.alignment = Alignment(vertical="top", wrap_text=True)
    for i, w in enumerate(widths, 1):
        ws.column_dimensions[get_column_letter(i)].width = w
    ws.freeze_panes = "A2"
    if rows:
        ws.auto_filter.ref = ws.dimensions
    return ws


def to_xlsx(d: Decomposition) -> bytes:
    wb = Workbook()
    rows, story_rows = [], []
    for story in d.stories:
        story_rows.append(len(rows) + 2)
        rows.append(["История", story.id, d.epic.title, story.title, "", story.description,
                     _lines(story.acceptance_criteria), ", ".join(story.requirement_ids), "", ""])
        for t in story.tasks:
            rows.append(["Задача", t.id, story.id, t.title, t.type, t.description, _lines(t.definition_of_done),
                         ", ".join(t.requirement_ids), ", ".join(t.source_refs), _scenarios(t)])
    ws = _sheet(wb, STORY_SHEET, STORY_COLUMNS, rows, [10, 11, 11, 48, 12, 50, 45, 16, 30, 45], first=True)
    for r in story_rows:
        for cell in ws[r]:
            cell.fill = PatternFill("solid", fgColor=STORY_FILL)
            cell.font = Font(bold=True)

    tasks_by_req: dict[str, list[str]] = {}
    for s in d.stories:
        for t in s.tasks:
            for r in t.requirement_ids:
                tasks_by_req.setdefault(r, []).append(t.id)
    _sheet(wb, "Требования", ["ID", "Тип", "Требование", "Источники", "Задачи"],
           [[r.id, REQ_TYPES.get(r.type, r.type), r.text, ", ".join(r.source_refs),
             ", ".join(tasks_by_req.get(r.id, [])) or "НЕ ПОКРЫТО"] for r in d.requirements],
           [10, 18, 60, 40, 30])

    c = d.coverage
    _sheet(wb, "Покрытие", ["Показатель", "Значение"], [
        ["Покрытие требований задачами, %", c.coverage_percent],
        ["Требования без задач", ", ".join(c.uncovered_requirements) or "—"],
        ["Требования без историй", ", ".join(c.requirements_without_stories) or "—"],
        ["Задачи без обоснования", ", ".join(c.tasks_without_requirements) or "—"],
        ["Ссылки на несуществующие источники", "\n".join(c.unknown_refs) or "—"],
        ["Операции контракта в работе", "\n".join(c.contract_ops_used) or "—"],
        ["Операции без задач на реализацию", "\n".join(c.ops_without_tasks) or "—"],
        ["Операции без интеграционного теста", "\n".join(c.ops_without_tests) or "—"],
        ["Не задействованы в эпике — подтвердите", "\n".join(c.contract_ops_unused) or "—"],
    ] + [[f"{SEVERITY[i.severity]}: {i.target_id}", i.message] for i in d.issues], [42, 80])

    qa_rows = [["Вопрос", q.id, q.text, " / ".join(q.options), q.answer or f"Без ответа, принято: {_default(q)}"]
               for q in d.questions]
    qa_rows += [["Допущение", "", a, "", ""] for a in d.assumptions]
    qa_rows += [["Пробел", g.id, g.text, g.risk, ", ".join(g.source_refs)] for g in d.gaps]
    _sheet(wb, "Вопросы и пробелы", ["Вид", "ID", "Текст", "Варианты / риск", "Ответ / источники"], qa_rows,
           [12, 9, 60, 45, 40])

    s = d.stats
    _sheet(wb, "Статистика", ["Показатель", "Значение"], [
        ["Эпик", d.epic.title], ["Метка", d.epic.label], ["Целевой язык", d.target_language.value or "не определён"],
        ["Требований", s.requirements_count], ["Историй", s.stories_count], ["Задач", s.tasks_count],
        *[[f"Задач типа {k}", v] for k, v in sorted(s.tasks_by_type.items())],
        ["Вопросов", s.questions_count], ["Пробелов", s.gaps_count], ["Допущений", s.assumptions_count],
        ["Замечаний проверок", s.issues_count], ["Модель", d.model],
    ], [30, 60])

    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _table(doc, header: list[str], rows: list[list[str]]):
    table = doc.add_table(rows=1, cols=len(header))
    table.style = "Table Grid"
    for cell, text in zip(table.rows[0].cells, header):
        cell.text = ""
        run = cell.paragraphs[0].add_run(text)
        run.bold = True
    for row in rows:
        cells = table.add_row().cells
        for cell, text in zip(cells, row):
            cell.text = str(text)
    return table


def _bullets(doc, items: list[str]) -> None:
    for item in items:
        doc.add_paragraph(item, style="List Bullet")


def _story_section(doc, story: Story) -> None:
    doc.add_heading(f"{story.id}. {story.title}", level=2)
    if story.description:
        doc.add_paragraph(story.description)
    doc.add_paragraph().add_run("Критерии приёмки").bold = True
    _bullets(doc, story.acceptance_criteria or ["не указаны"])
    doc.add_paragraph(f"Требования: {', '.join(story.requirement_ids) or '—'}")
    if story.tasks:
        _table(doc, ["ID", "Тип", "Задача", "Критерии готовности", "Источники"],
               [[t.id, t.type, f"{t.title}\n{t.description}", "\n".join(t.definition_of_done),
                 "\n".join(t.source_refs)] for t in story.tasks])
    for t in story.tasks:
        if t.test_scenarios:
            doc.add_paragraph().add_run(f"Тест-сценарии {t.id}").bold = True
            _bullets(doc, [f"{s.name}: {s.input} → {s.expected}" for s in t.test_scenarios])


def to_docx(d: Decomposition) -> bytes:
    doc = Document()
    doc.styles["Normal"].font.name = "Calibri"
    doc.styles["Normal"].font.size = Pt(10.5)
    title = doc.add_heading(f"Декомпозиция эпика: {d.epic.title}", level=0)
    title.alignment = WD_ALIGN_PARAGRAPH.LEFT
    meta = doc.add_paragraph()
    meta.add_run(f"Метка: {d.epic.label}\nЦелевой язык: {d.target_language.value or 'не определён'}\n"
                 f"Модель: {d.model}").font.color.rgb = RGBColor(0x55, 0x55, 0x55)

    s = d.stats
    doc.add_heading("Сводка", level=1)
    _table(doc, ["Показатель", "Значение"], [
        ["Требований", s.requirements_count], ["Пользовательских историй", s.stories_count],
        ["Технических задач", s.tasks_count], ["Покрытие требований задачами", f"{d.coverage.coverage_percent}%"],
        ["Пробелов и противоречий", s.gaps_count], ["Уточняющих вопросов", s.questions_count],
        ["Замечаний проверок", s.issues_count],
    ])

    doc.add_heading("Эпик", level=1)
    for para in d.epic.text.split("\n\n"):
        doc.add_paragraph(para.strip())

    doc.add_heading("Требования", level=1)
    _table(doc, ["ID", "Тип", "Требование", "Источники"],
           [[r.id, REQ_TYPES.get(r.type, r.type), r.text, "\n".join(r.source_refs)] for r in d.requirements])

    doc.add_heading("Пользовательские истории и задачи", level=1)
    for story in d.stories:
        _story_section(doc, story)

    if d.gaps:
        doc.add_heading("Пробелы и противоречия", level=1)
        _table(doc, ["ID", "Проблема", "Риск", "Источники"],
               [[g.id, g.text, g.risk, "\n".join(g.source_refs)] for g in d.gaps])

    if d.questions or d.assumptions:
        doc.add_heading("Вопросы и допущения", level=1)
        for q in d.questions:
            answer = q.answer or f"без ответа, принято: {_default(q)}"
            doc.add_paragraph(f"{q.id}. {q.text}\nОтвет: {answer}")
        _bullets(doc, d.assumptions)

    c = d.coverage
    doc.add_heading("Покрытие и проверки", level=1)
    _table(doc, ["Показатель", "Значение"], [
        ["Требования без задач", ", ".join(c.uncovered_requirements) or "—"],
        ["Задачи без обоснования", ", ".join(c.tasks_without_requirements) or "—"],
        ["Ссылки на несуществующие источники", "\n".join(c.unknown_refs) or "—"],
        ["Операции без задач на реализацию", "\n".join(c.ops_without_tasks) or "—"],
        ["Операции без интеграционного теста", "\n".join(c.ops_without_tests) or "—"],
        ["Не задействованы в эпике — подтвердите", "\n".join(c.contract_ops_unused) or "—"],
    ])
    if d.issues:
        doc.add_paragraph()
        _table(doc, ["Уровень", "Объект", "Замечание"],
               [[SEVERITY[i.severity], i.target_id, i.message] for i in d.issues])

    errors = sum(i.severity == "error" for i in d.issues)
    doc.add_paragraph()
    stamp = _table(doc, ["ОТК", "Результат"], [
        ["Проверки кодом", "Принято" if errors == 0 else f"Брак: ошибок {errors}"],
        ["Покрытие требований", f"{c.coverage_percent}%"],
    ])
    stamp.alignment = WD_TABLE_ALIGNMENT.RIGHT

    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()
