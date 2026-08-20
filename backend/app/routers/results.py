from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_admin, require_student, Principal
from app.models import Result, User
from app.schemas import ResultCreate, ResultOut

router = APIRouter(prefix="/api/results", tags=["results"])


def _to_out(r: Result) -> ResultOut:
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
    return [_to_out(r) for r in results]


@router.get("/mine", response_model=list[ResultOut])
def list_my_results(db: Session = Depends(get_db), student: User = Depends(require_student)):
    results = (
        db.query(Result)
        .filter(Result.student_user_id == student.id)
        .order_by(Result.created_at.desc())
        .all()
    )
    return [_to_out(r) for r in results]


@router.post("", response_model=ResultOut)
def create_result(payload: ResultCreate, db: Session = Depends(get_db), student: User = Depends(require_student)):
    result = Result(
        student_user_id=student.id,
        student_id=student.student_id,
        student_name=student.student_name,
        grade_level=student.grade_level,
        subject_id=payload.subjectId,
        test_title=payload.testTitle,
        date=payload.date,
        score=payload.score,
        max_score=payload.maxScore,
        correct_count=payload.correctCount,
        partial_count=payload.partialCount,
        wrong_count=payload.wrongCount,
        struggling_topics=payload.strugglingTopics,
        pronunciation_note=payload.pronunciationNote,
        status=payload.status,
    )
    db.add(result)
    db.commit()
    db.refresh(result)
    return _to_out(result)
