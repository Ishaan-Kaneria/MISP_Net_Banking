from pathlib import Path

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import Document

CORPUS_PATH = Path(__file__).parent.parent / "products.md"


def ensure_corpus(db: Session) -> None:
    if db.scalar(select(Document.id).limit(1)):
        return
    text = CORPUS_PATH.read_text(encoding="utf-8")
    chunks = [chunk.strip() for chunk in text.split("## ") if chunk.strip()]
    for chunk in chunks:
        title, _, content = chunk.partition("\n")
        db.add(Document(source=title.strip(), content=content.strip()))
    db.commit()


def retrieve(db: Session, query: str, limit: int = 4) -> list[Document]:
    ensure_corpus(db)
    terms = {term.lower() for term in query.split() if len(term) > 2}
    documents = list(db.scalars(select(Document)))
    ranked = sorted(documents, key=lambda doc: sum(term in f"{doc.source} {doc.content}".lower() for term in terms), reverse=True)
    return ranked[:limit]