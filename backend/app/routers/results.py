from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin, require_student, Principal
from app.models import Result, User
from app.schemas import ResultOut

router = APIRouter(prefix="/api/results", tags=["results"])

# Results are read-only over the API on purpose. The only way one comes into
# existence is routers/attempts.py finishing an attempt, which computes it from
# answers the server itself graded — a client can never submit its own score.


def to_out(r: Result) -> ResultOut:
    return ResultOut(
        id=r.id,
        studentId=r.student_id,
        studentName=r.student_name,
        gradeLevel=r.grade_level,
        subjectId=r.subject_id,
        testTitle=r.test_title,
        date=r.date,
        score=r.score,
        maxScore=r.max_score,
        correctCount=r.correct_count,
        partialCount=r.partial_count,
        wrongCount=r.wrong_count,
        strugglingTopics=r.struggling_topics,
        pronunciationNote=r.pronunciation_note,
        status=r.status,
    )


@router.get("", response_model=list[ResultOut])
def list_all_results(db: Session = Depends(get_db), _: Principal = Depends(require_admin)):
    results = db.query(Result).order_by(Result.created_at.desc()).all()
    return [to_out(r) for r in results]


@router.get("/mine", response_model=list[ResultOut])
def list_my_results(db: Session = Depends(get_db), student: User = Depends(require_student)):
    results = (
        db.query(Result)
        .filter(Result.student_user_id == student.id)
        .order_by(Result.created_at.desc())
        .all()
    )
    return [to_out(r) for r in results]

