from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_principal, require_admin, Principal
from app.models import TestPaper
from app.schemas import PaperCreate, PaperOut

router = APIRouter(prefix="/api/papers", tags=["papers"])


def _to_out(p: TestPaper) -> PaperOut:
    return PaperOut(
        id=p.id,
        subjectId=p.subject_id,
        title=p.title,
        gradeLevel=p.grade_level,
        active=p.active,
        durationMinutes=p.duration_minutes,
        questions=p.questions,
    )


@router.get("", response_model=list[PaperOut])
def list_papers(
    grade_level: str | None = Query(None),
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    query = db.query(TestPaper)
    if principal.role == "admin":
        papers = query.order_by(TestPaper.created_at.desc()).all()
    else:
        query = query.filter(TestPaper.active.is_(True))
        if grade_level:
            papers = [
                p for p in query.all()
                if p.grade_level.lower() == grade_level.lower() or p.grade_level == "All Grades"
            ]
        else:
            papers = query.all()
    return [_to_out(p) for p in papers]


@router.get("/{paper_id}", response_model=PaperOut)
def get_paper(paper_id: str, db: Session = Depends(get_db), _: Principal = Depends(get_current_principal)):
    paper = db.get(TestPaper, paper_id)
    if not paper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")
    return _to_out(paper)


@router.post("", response_model=PaperOut)
def create_paper(payload: PaperCreate, db: Session = Depends(get_db), _: Principal = Depends(require_admin)):
    paper = TestPaper(
        id=payload.id,
        subject_id=payload.subjectId,
        title=payload.title,
        grade_level=payload.gradeLevel,
        active=payload.active,
        duration_minutes=payload.durationMinutes,
        questions=[q.model_dump() for q in payload.questions],
    )
    db.add(paper)
    db.commit()
    db.refresh(paper)
    return _to_out(paper)


@router.delete("/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_paper(paper_id: str, db: Session = Depends(get_db), _: Principal = Depends(require_admin)):
    paper = db.get(TestPaper, paper_id)
    if not paper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")
    db.delete(paper)
    db.commit()
