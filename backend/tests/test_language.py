from app.demos import load_demo
from app.language import CONFIDENT, detect_language
from app.sources import InputFile, parse_inputs


def test_demo_is_go_with_confidence():
    demo = load_demo("boutique-delivery")
    lang = detect_language(demo.files, parse_inputs(demo.epic_text, demo.files))
    assert lang.value == "Go"
    assert lang.confidence >= CONFIDENT
    assert any("shipping_client.go" in e for e in lang.evidence)


def test_no_signals_is_unknown():
    lang = detect_language([], parse_inputs("Сделать отчёт по продажам", []))
    assert lang.value is None
    assert lang.confidence < CONFIDENT


def test_cpp_qt_from_text_only_is_not_confident():
    lang = detect_language([], parse_inputs("Клиент на Qt должен показывать телеметрию", []))
    assert lang.value == "C++"
    assert lang.confidence < CONFIDENT


def test_csharp_from_files():
    files = [InputFile("Client.cs", "examples", b"class A {}"),
             InputFile("api.proto", "contracts", b'syntax="proto3";\noption csharp_namespace = "X";')]
    lang = detect_language(files, [])
    assert lang.value == "C#"
    assert lang.confidence >= CONFIDENT
