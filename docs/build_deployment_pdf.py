from pathlib import Path
import re

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import ListFlowable, ListItem, Paragraph, Preformatted, SimpleDocTemplate, Spacer

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "DEPLOYMENT_NEON_SUPABASE.md"
OUTPUT = ROOT / "misp-bank-neon-supabase-deployment.pdf"

styles = getSampleStyleSheet()
styles.add(ParagraphStyle(name="TitleCustom", parent=styles["Title"], fontName="Helvetica-Bold", fontSize=25, leading=30, textColor=colors.HexColor("#182a3a"), spaceAfter=12))
styles.add(ParagraphStyle(name="H1Custom", parent=styles["Heading1"], fontName="Helvetica-Bold", fontSize=17, leading=21, textColor=colors.HexColor("#182a3a"), spaceBefore=13, spaceAfter=6, keepWithNext=True))
styles.add(ParagraphStyle(name="H2Custom", parent=styles["Heading2"], fontName="Helvetica-Bold", fontSize=12.5, leading=15, textColor=colors.HexColor("#087f78"), spaceBefore=9, spaceAfter=4, keepWithNext=True))
styles.add(ParagraphStyle(name="BodyCustom", parent=styles["BodyText"], fontName="Helvetica", fontSize=9.2, leading=12.5, textColor=colors.HexColor("#182a3a"), spaceAfter=5))
styles.add(ParagraphStyle(name="CodeCustom", parent=styles["Code"], fontName="Courier", fontSize=7.5, leading=9.2, textColor=colors.white, backColor=colors.HexColor("#182a3a"), borderPadding=7, spaceBefore=3, spaceAfter=7))
styles.add(ParagraphStyle(name="Meta", parent=styles["BodyText"], fontSize=10, leading=14, backColor=colors.HexColor("#eef5f1"), borderColor=colors.HexColor("#087f78"), borderWidth=0.8, borderPadding=8, spaceBefore=7, spaceAfter=10))


def inline(text: str) -> str:
    text = text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    return re.sub(r"`([^`]+)`", r"<font name='Courier'>\1</font>", text)


def footer(canvas, doc):
    canvas.saveState()
    canvas.setStrokeColor(colors.HexColor("#d9e2de"))
    canvas.line(16 * mm, 13 * mm, A4[0] - 16 * mm, 13 * mm)
    canvas.setFont("Helvetica", 7.5)
    canvas.setFillColor(colors.HexColor("#586a73"))
    canvas.drawString(16 * mm, 8 * mm, "MISP Bank | Neon and Supabase Deployment")
    canvas.drawRightString(A4[0] - 16 * mm, 8 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build():
    story = [Spacer(1, 18 * mm), Paragraph("MISP BANK", styles["TitleCustom"]), Paragraph("NEON / SUPABASE DEPLOYMENT GUIDE", styles["H1Custom"]), Paragraph("Exact setup, connection, deployment, verification, and cost-safety steps.", styles["Meta"])]
    in_code = False
    code = []
    bullets = []
    for raw in SOURCE.read_text(encoding="utf-8").splitlines():
        line = raw.rstrip()
        if line.startswith("```"):
            if in_code:
                story.append(Preformatted("\n".join(code), styles["CodeCustom"]))
                code = []
            in_code = not in_code
            continue
        if in_code:
            code.append(line)
            continue
        if line.startswith("- ") or line.startswith("- [ ] "):
            text = line[2:] if line.startswith("- ") else line
            bullets.append(ListItem(Paragraph(inline(text), styles["BodyCustom"]), leftIndent=12))
            continue
        if bullets:
            story.append(ListFlowable(bullets, bulletType="bullet", leftIndent=14))
            bullets = []
        if not line:
            continue
        if line.startswith("# "):
            continue
        if line.startswith("## "):
            story.append(Paragraph(inline(line[3:]), styles["H1Custom"]))
        elif line.startswith("### "):
            story.append(Paragraph(inline(line[4:]), styles["H2Custom"]))
        else:
            story.append(Paragraph(inline(line), styles["BodyCustom"]))
    if bullets:
        story.append(ListFlowable(bullets, bulletType="bullet", leftIndent=14))
    doc = SimpleDocTemplate(str(OUTPUT), pagesize=A4, rightMargin=16 * mm, leftMargin=16 * mm, topMargin=15 * mm, bottomMargin=18 * mm, title="MISP Bank Neon Supabase Deployment Guide", author="MISP Bank")
    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    print(OUTPUT)


if __name__ == "__main__":
    build()
