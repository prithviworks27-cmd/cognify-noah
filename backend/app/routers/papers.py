from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import get_current_principal, require_admin, require_student, Principal
from app.grading import evaluate_answer
from app.models import TestPaper, User
from app.schemas import GradeRequest, GradeResult, PaperCreate, PaperOut

router = APIRouter(prefix="/api/papers", tags=["papers"])

# Fields a student's own browser is allowed to see. acceptedAnswers/keywords
# are the answer key — grading happens server-side precisely so those never
# have to be sent to the student taking the test.
STUDENT_SAFE_QUESTION_FIELDS = ("text", "points", "topicTag")


def _to_out(p: TestPaper, *, include_rubric: bool) -> PaperOut:
    if include_rubric:
        questions = p.questions
    else:
        questions = [{k: q.get(k) for k in STUDENT_SAFE_QUESTION_FIELDS} for q in p.questions]

    return PaperOut(
        id=p.id,
        subjectId=p.subject_id,
        title=p.title,
        gradeLevel=p.grade_level,
        active=p.active,
        durationMinutes=p.duration_minutes,
        questions=questions,
    )


@router.get("", response_model=list[PaperOut])
def list_papers(
    grade_level: str | None = Query(None),
    db: Session = Depends(get_db),
    principal: Principal = Depends(get_current_principal),
):
    is_admin = principal.role == "admin"
    query = db.query(TestPaper)
    if is_admin:
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
    return [_to_out(p, include_rubric=is_admin) for p in papers]


@router.get("/{paper_id}", response_model=PaperOut)
def get_paper(paper_id: str, db: Session = Depends(get_db), principal: Principal = Depends(get_current_principal)):
    paper = db.get(TestPaper, paper_id)
    if not paper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")
    return _to_out(paper, include_rubric=principal.role == "admin")


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
    return _to_out(paper, include_rubric=True)


@router.delete("/{paper_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_paper(paper_id: str, db: Session = Depends(get_db), _: Principal = Depends(require_admin)):
    paper = db.get(TestPaper, paper_id)
    if not paper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")
    db.delete(paper)
    db.commit()


@router.post("/{paper_id}/questions/{question_index}/grade", response_model=GradeResult)
def grade_question(
    paper_id: str,
    question_index: int,
    payload: GradeRequest,
    db: Session = Depends(get_db),
    _student: User = Depends(require_student),
):
    paper = db.get(TestPaper, paper_id)
    if not paper:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")
    if question_index < 0 or question_index >= len(paper.questions):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Question index out of range")

    # The rubric is read server-side from the DB — never trust a client-supplied one.
    question = paper.questions[question_index]
    result = evaluate_answer(question, payload.transcript)
    return GradeResult(**result)
