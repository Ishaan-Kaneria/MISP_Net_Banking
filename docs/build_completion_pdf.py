from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, PageBreak, Paragraph, Preformatted, SimpleDocTemplate, Spacer


ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "PROJECT_COMPLETION_PLAN.md"
OUTPUT = ROOT / "misp-bank-completion-plan.pdf"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="CoverTitle", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=28, leading=32, textColor=colors.HexColor("#182a3a"), alignment=TA_CENTER, spaceAfter=8))
styles.add(ParagraphStyle(name="CoverSub", parent=styles["Normal"], fontSize=13, leading=18, textColor=colors.HexColor("#087f78"), alignment=TA_CENTER, spaceAfter=18))
styles.add(ParagraphStyle(name="H1Custom", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=19, leading=23, textColor=colors.HexColor("#182a3a"), spaceBefore=15, spaceAfter=7, keepWithNext=True))
styles.add(ParagraphStyle(name="H2Custom", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=13, leading=16, textColor=colors.HexColor("#087f78"), spaceBefore=10, spaceAfter=4, keepWithNext=True))
styles.add(ParagraphStyle(name="BodyCustom", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.5, leading=13, textColor=colors.HexColor("#182a3a"), spaceAfter=6))
styles.add(ParagraphStyle(name="Meta", parent=styles["BodyText"], fontSize=9.5, leading=14, backColor=colors.HexColor("#eef5f1"), borderColor=colors.HexColor("#087f78"), borderWidth=0.8, borderPadding=9, spaceBefore=8, spaceAfter=12))
styles.add(ParagraphStyle(name="CodeCustom", parent=styles["Code"], fontName="Courier", fontSize=8, leading=10, textColor=colors.white, backColor=colors.HexColor("#182a3a"), borderPadding=8, spaceBefore=4, spaceAfter=8))


def escape(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def inline(text: str) -> str:
    text = escape(text)
    return text.replace("`", "")


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d9e2de"))
    canvas.line(16 * mm, 13 * mm, A4[0] - 16 * mm, 13 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#586a73"))
    canvas.drawString(16 * mm, 8 * mm, "MISP | Project Completion Plan")
    canvas.drawRightString(A4[0] - 16 * mm, 8 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build():
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    story = [Spacer(1, 25 * mm), Paragraph("MISP", styles["CoverTitle"]), Paragraph("PROJECT COMPLETION PLAN", styles["CoverSub"]), Paragraph("What is complete, what remains, and the exact path to a submission-ready build.", styles["BodyCustom"]), Spacer(1, 8 * mm)]
    in_code = False
    code_lines = []
    bullets = []
    for raw in lines:
        line = raw.rstrip()
        if line.startswith("```"):
            if in_code:
                story.append(Preformatted("\n".join(code_lines), styles["CodeCustom"]))
                code_lines = []
            in_code = not in_code
            continue
        if in_code:
            code_lines.append(line)
            continue
        if line.startswith("- "):
            bullets.append(ListItem(Paragraph(inline(line[2:]), styles["BodyCustom"]), leftIndent=12))
            continue
        if bullets and not line.startswith("- "):
            story.append(ListFlowable(bullets, bulletType="bullet", start="circle", leftIndent=14))
            bullets = []
        if not line:
            continue
        if line.startswith("# "):
            if "Project Completion Plan" in line:
                continue
            story.append(Paragraph(inline(line[2:]), styles["H1Custom"]))
        elif line.startswith("## "):
            story.append(Paragraph(inline(line[3:]), styles["H1Custom"]))
        elif line.startswith("### "):
            story.append(Paragraph(inline(line[4:]), styles["H2Custom"]))
        elif line[0:2].isdigit() and line[2:3] == ".":
            story.append(Paragraph(inline(line), styles["BodyCustom"]))
        elif line.startswith("|"):
            story.append(Paragraph(inline(line.replace("|", "  ")), styles["BodyCustom"]))
        elif line.startswith("Date:") or line.startswith("Repository:") or line.startswith("Current branch:") or line.startswith("Current checkpoint:"):
            story.append(Paragraph(inline(line), styles["Meta"]))
        else:
            story.append(Paragraph(inline(line), styles["BodyCustom"]))
    if bullets:
        story.append(ListFlowable(bullets, bulletType="bullet", start="circle", leftIndent=14))
    doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=16 * mm, leftMargin=16 * mm, topMargin=16 * mm, bottomMargin=18 * mm, title="MISP Project Completion Plan", author="MISP")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)


if __name__ == "__main__":
    build()
    print(OUTPUT)