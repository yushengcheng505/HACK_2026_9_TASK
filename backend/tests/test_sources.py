import io

from docx import Document

from app.context import render_sources, select_context
from app.demos import load_demo
from app.sources import InputFile, contract_ops, parse_inputs


def demo_sources():
    demo = load_demo("boutique-delivery")
    return demo, parse_inputs(demo.epic_text, demo.files)


def test_demo_proto_rpcs_and_messages():
    _, sources = demo_sources()
    ids = {s.id for s in sources}
    assert "PROTO:CourierService.CreateShipment" in ids
    assert "PROTO:ShippingService.GetQuote" in ids
    assert "PROTO:CreateShipmentRequest" in ids
    assert "PROTO:DeliveryMethod" in ids
    # Address есть в обоих .proto — второй получает квалификатор пакета
    assert "PROTO:Address" in ids and "PROTO:hipstershop.Address" in ids
    rpc = next(s for s in sources if s.id == "PROTO:CourierService.CreateShipment")
    assert "Каждый вызов создаёт новое отправление" in rpc.text


def test_demo_openapi_ops():
    _, sources = demo_sources()
    ops = contract_ops(sources)
    assert "API:GET /v1/shipments/{shipment_id}/status" in ops
    assert "API:GET /v1/shipments/{shipment_id}/events" in ops
    assert "PROTO:CourierService.PrintLabel" in ops
    assert not any(op.startswith("PROTO:Address") for op in ops)


def test_demo_epic_and_docs():
    _, sources = demo_sources()
    epic = [s for s in sources if s.kind == "epic"]
    assert len(epic) >= 8
    assert any("два отправления" in s.text for s in epic)
    docs = {s.title: s for s in sources if s.kind == "doc"}
    assert "Отслеживание" in docs
    assert docs["Отслеживание"].id.startswith("DOC-")
    assert any(s.kind == "example" and s.file == "shipping_client.go" for s in sources)


def test_docx_sections_by_heading():
    doc = Document()
    doc.add_heading("Введение", level=1)
    doc.add_paragraph("Текст введения.")
    doc.add_heading("API", level=2)
    doc.add_paragraph("Метод GetStatus.")
    buf = io.BytesIO()
    doc.save(buf)
    sources = parse_inputs("", [InputFile("spec.docx", "product_docs", buf.getvalue())])
    assert [(s.title, s.text) for s in sources] == [("Введение", "Текст введения."), ("API", "Метод GetStatus.")]


def test_epic_only():
    sources = parse_inputs("Нужно сделать отчёт.\n\n- пункт один\n- пункт два", [])
    assert [s.id for s in sources] == ["EPIC-1", "EPIC-2", "EPIC-3"]


def test_select_context_respects_budget_and_keeps_epic():
    _, sources = demo_sources()
    chosen = select_context(sources, "отслеживание статуса", budget=4000)
    ids = {s.id for s in chosen}
    assert all(s.id in ids for s in sources if s.kind == "epic")
    assert "PROTO:CourierService.CreateShipment" in ids
    assert len(chosen) < len(sources)
    assert '<source id="EPIC-1"' in render_sources(chosen)
