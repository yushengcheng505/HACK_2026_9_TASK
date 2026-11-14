from app.findings import ReviewContext, filter_findings, gap_findings
from app.schemas import Evidence, Finding, GapDraft, GapEvidence, Requirement, Source, Story, Task

SOURCES = [
    Source(id="EPIC-1", kind="epic", file="epic", title="Эпик", text="Уведомлять покупателя о статусе."),
    Source(id="PROTO:Courier.Create", kind="proto_rpc", file="c.proto", title="rpc Create",
           text="// Каждый вызов создаёт новое отправление."),
    Source(id="DOC-1", kind="doc", file="guide.md", title="Статусы", text="Статусы обновляются пакетно раз в 15 минут."),
]
REQS = [
    Requirement(id="REQ-001", type="integration", text="Создавать отправление после оплаты",
                source_refs=["PROTO:Courier.Create"]),
    Requirement(id="REQ-002", type="functional", text="Уведомлять покупателя об изменении статуса"),
    Requirement(id="REQ-003", type="nonfunctional", text="Ключ API хранится в секретах"),
]


def task(id, reqs, refs=(), title=None, type="backend"):
    return Task(id=id, title=title or f"Задача {id}", description="Опрос статуса раз в 30 секунд", type=type,
                requirement_ids=list(reqs), source_refs=list(refs))


STORIES = [
    Story(id="US-001", title="Как покупатель, я хочу трек, чтобы следить", description="d",
          acceptance_criteria=["Если оплата прошла, то создаётся отправление"], requirement_ids=["REQ-001", "REQ-003"],
          tasks=[task("TASK-001", ["REQ-001"], ["PROTO:Courier.Create"]), task("TASK-002", ["REQ-003"])]),
    Story(id="US-002", title="Как покупатель, я хочу уведомления, чтобы знать", description="d",
          acceptance_criteria=["Покупатель получает письмо при смене статуса"], requirement_ids=["REQ-002", "REQ-001"],
          tasks=[task("TASK-003", ["REQ-002"]), task("TASK-004", ["REQ-002", "REQ-001"])]),
]
CTX = ReviewContext(stories=STORIES, requirements=REQS, sources=SOURCES,
                    decisions="- Допущение: Опрашивать статус раз в 15 минут и уведомлять сразу.")


def finding(n=1, kind="contradicts_decision", severity="high", confidence=90, tasks=("TASK-003",),
            evidence=(("decision", "", "опрашивать  статус раз в 15 минут"),), source="reviewer", stories=("US-002",)):
    return Finding(id=f"F-{n}", source=source, kind=kind, severity=severity, confidence=confidence,
                   story_ids=list(stories), task_ids=list(tasks), scenario="опрос чаще, чем решено",
                   evidence=[Evidence(where=w, ref=r, quote=q) for w, r, q in evidence])


def verdict(f):
    return f.verdict, f.verdict_reason


def test_quote_matches_after_normalization():
    f = finding(evidence=(("decision", "", "  ОПРАШИВАТЬ статус раз в 15 минут "),))
    filter_findings([f], CTX)
    assert f.verdict == "pending"


def test_quote_with_yo_and_quotes_matches():
    ctx = ReviewContext(STORIES, REQS, SOURCES, decisions="Решено: «ещё раз» отправлять письмо")
    f = finding(evidence=(("decision", "", 'Решено: "еще раз" отправлять'),))
    filter_findings([f], ctx)
    assert f.verdict == "pending"


def test_quote_from_task_json_with_indents_matches():
    f = finding(kind="wrong_requirement", tasks=("TASK-004",),
                evidence=(("task", "TASK-004", '"requirement_ids": [\n   "REQ-002",\n   "REQ-001"\n  ]'),))
    filter_findings([f], CTX)
    assert f.verdict == "pending"


def test_invented_quote_is_rejected():
    f = finding(evidence=(("decision", "", "опрашивать статус раз в 5 секунд"),))
    filter_findings([f], CTX)
    assert f.verdict == "rejected_by_filter" and "цитата не найдена" in f.verdict_reason


def test_wrong_ref_falls_back_to_same_kind():
    f = finding(kind="failure_not_handled", tasks=("TASK-001",),
                evidence=(("source", "PROTO:Courier.Teleport", "Каждый вызов создаёт новое отправление"),))
    filter_findings([f], CTX)
    assert f.verdict == "pending"


def test_low_confidence_and_short_quote_are_rejected():
    weak = finding(confidence=79)
    short = finding(n=2, evidence=(("decision", "", "раз в 15"),))
    filter_findings([weak, short], CTX)
    assert weak.verdict == short.verdict == "rejected_by_filter"
    assert "уверенность" in weak.verdict_reason


def test_unknown_ids_and_single_task_duplicate_are_rejected():
    ghost = finding(tasks=("TASK-999",))
    dup = finding(n=2, kind="duplicate", source="editor", tasks=("TASK-001", "TASK-001"),
                  evidence=(("task", "TASK-001", "Опрос статуса раз в 30 секунд"),))
    no_task = finding(n=3, tasks=())
    filter_findings([ghost, dup, no_task], CTX)
    assert "TASK-999" in ghost.verdict_reason
    assert dup.verdict == "rejected_by_filter" and "две разные задачи" in dup.verdict_reason
    assert no_task.verdict == "rejected_by_filter" and "не указана задача" in no_task.verdict_reason


def test_unneeded_task_that_alone_covers_requirement_is_rejected():
    sole = finding(kind="unneeded_task", source="simplifier", tasks=("TASK-002",),
                   evidence=(("task", "TASK-002", "Опрос статуса раз в 30 секунд"),))
    shared = finding(n=2, kind="unneeded_task", source="simplifier", tasks=("TASK-004",),
                     evidence=(("task", "TASK-004", "Опрос статуса раз в 30 секунд"),))
    filter_findings([sole, shared], CTX)
    assert sole.verdict == "rejected_by_filter" and "REQ-003" in sole.verdict_reason
    assert shared.verdict == "pending"


def test_limit_keeps_most_severe():
    items = [finding(1, severity="low"), finding(2, severity="critical"), finding(3, severity="high")]
    filter_findings(items, CTX, limit=2)
    assert [f.verdict for f in items] == ["rejected_by_filter", "pending", "pending"]
    assert "лимит" in items[0].verdict_reason


def test_gap_findings():
    gaps = [
        GapDraft(text="Минута против 15 минут", risk="невыполнимо", source_refs=["EPIC-1", "DOC-1"],
                 evidence=[GapEvidence(source_id="DOC-1", quote="обновляются пакетно раз в 15 минут"),
                           GapEvidence(source_id="EPIC-1", quote="выдуманная цитата из эпика")]),
        GapDraft(text="Нет метода", risk="r", source_refs=["PROTO:Courier.Teleport"],
                 evidence=[GapEvidence(source_id="PROTO:Courier.Teleport", quote="Каждый вызов создаёт")]),
        GapDraft(text="Без цитат", risk="r", source_refs=["DOC-1"]),
    ]
    found = gap_findings(gaps, SOURCES, first_id=5)
    assert [f.id for f in found] == ["F-5", "F-6", "F-7"]
    assert found[0].verdict == "pending" and found[0].kind == "gap" and found[0].source == "analyst"
    assert found[1].verdict == "rejected_by_filter" and "PROTO:Courier.Teleport" in found[1].verdict_reason
    assert found[2].verdict == "rejected_by_filter"


def test_triage_routes_by_severity_and_role():
    from app.findings import triage

    high, low = finding(1, severity="high"), finding(2, severity="low")
    simple = finding(3, kind="merge_tasks", source="simplifier", severity="medium", tasks=("TASK-003", "TASK-004"))
    done = finding(4)
    done.verdict = "rejected_by_filter"
    assert triage([high, low, simple, done]) == [high, simple]
    assert low.verdict == "deferred" and done.verdict == "rejected_by_filter"


def test_apply_verdicts_and_fallback():
    from app.findings import apply_verdicts
    from app.schemas import VerdictDraft

    a, b, c = finding(1), finding(2), finding(3, kind="unneeded_task", source="simplifier", severity="medium")
    apply_verdicts([a, b, c], [VerdictDraft(finding_id="F-1", verdict="downgraded", severity="high", reason="мелко"),
                               VerdictDraft(finding_id="F-2", verdict="rejected", reason="неверно")])
    assert (a.verdict, a.severity) == ("downgraded", "medium")
    assert b.verdict == "rejected"
    assert c.verdict == "rejected" and "не вынес" in c.verdict_reason
    d, e = finding(4), finding(5, kind="unneeded_task", source="simplifier")
    apply_verdicts([d, e], None, "скептик упал")
    assert d.verdict == "confirmed" and e.verdict == "rejected" and "скептик упал" in d.verdict_reason


def confirmed(f):
    f.verdict = "confirmed"
    return f


def test_plan_actions_removes_duplicate_from_later_story():
    from app.findings import apply_removals, plan_actions

    dup = confirmed(finding(1, kind="duplicate", source="editor", tasks=("TASK-001", "TASK-004")))
    ctx = ReviewContext(STORIES, REQS, SOURCES, CTX.decisions)
    actions = plan_actions([dup], ctx)
    assert actions.removals == [("US-002", "TASK-004", "F-1")] and actions.redo == {}
    assert dup.resolution == "fixed"
    stories = apply_removals(STORIES, actions.removals)
    assert [t.id for t in stories[1].tasks] == ["TASK-003"]
    assert [t.id for t in STORIES[1].tasks] == ["TASK-003", "TASK-004"]


def test_removal_that_uncovers_requirement_becomes_redo():
    from app.findings import plan_actions

    sole = confirmed(finding(1, kind="reuse_existing", source="simplifier", tasks=("TASK-002",)))
    again = confirmed(finding(2, kind="unneeded_task", source="simplifier", tasks=("TASK-004",)))
    twice = confirmed(finding(3, kind="duplicate", source="editor", tasks=("TASK-003", "TASK-004")))
    actions = plan_actions([sole, again, twice], CTX)
    assert actions.removals == [("US-002", "TASK-004", "F-2")]
    assert [f.id for f in actions.redo["US-001"]] == ["F-1"]
    assert twice.resolution == "fixed"


def test_blocked_duplicate_removal_redoes_story_of_removed_task():
    from app.findings import plan_actions

    stories = [STORIES[0], STORIES[1].model_copy(update={"tasks": [task("TASK-004", ["REQ-002"])]})]
    ctx = ReviewContext(stories, REQS, SOURCES, CTX.decisions)
    dup = confirmed(finding(1, kind="duplicate", source="editor", tasks=("TASK-001", "TASK-004")))
    assert list(plan_actions([dup], ctx).redo) == ["US-002"]


def test_deferred_rides_only_with_redo_of_its_story():
    from app.findings import plan_actions, redo_text

    main = confirmed(finding(1, tasks=("TASK-003",)))
    extra = finding(2, severity="low", tasks=("TASK-004",))
    extra.verdict = "deferred"
    lonely = finding(3, severity="low", tasks=("TASK-001",), stories=("US-001",))
    lonely.verdict = "deferred"
    actions = plan_actions([main, extra, lonely], CTX)
    assert list(actions.redo) == ["US-002"]
    assert [f.id for f in actions.redo["US-002"]] == ["F-1", "F-2"]
    text = redo_text(actions.redo["US-002"])
    assert "[F-1] HIGH" in text and "Необязательно" in text and "[F-2]" in text
    assert "«опрашивать  статус раз в 15 минут»" in text


def test_not_resolved_finding_goes_to_redo_again():
    from app.findings import plan_actions

    old = confirmed(finding(1, tasks=("TASK-001",), stories=("US-001",)))
    old.resolution = "not_resolved"
    assert list(plan_actions([old], CTX).redo) == ["US-001"]
