from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.deps import require_student
from app.grading import evaluate_answer, evaluate_answer_llm
from app.models import AttemptAnswer, ExamAttempt, Result, TestPaper, User
from app.routers.results import to_out
from app.schemas import AttemptGradeRequest, AttemptOut, AttemptStart, GradeResult, ResultOut

router = APIRouter(prefix="/api/attempts", tags=["attempts"])

PASS_MARK = 60


def _own_attempt(db: Session, attempt_id: str, student: User) -> ExamAttempt:
    attempt = db.get(ExamAttempt, attempt_id)
    # 404 (not 403) for someone else's attempt, so ids can't be probed.
    if attempt is None or attempt.student_user_id != student.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attempt not found")
    return attempt


@router.post("", response_model=AttemptOut)
def start_attempt(payload: AttemptStart, db: Session = Depends(get_db), student: User = Depends(require_student)):
    paper = db.get(TestPaper, payload.paperId)
    if paper is None or not paper.active:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Paper not found")
    if paper.grade_level != "All Grades" and paper.grade_level.lower() != student.grade_level.lower():
        raise HTTPException(status.HTTP_403_FORBIDDEN, "This paper is not assigned to your class")
    if not paper.questions:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "This paper has no questions")

    attempt = ExamAttempt(
        student_user_id=student.id,
        paper_id=paper.id,
        paper_title=paper.title,
        subject_id=paper.subject_id,
        question_count=len(paper.questions),
    )
    db.add(attempt)
    db.commit()
    db.refresh(attempt)
    return AttemptOut(attemptId=attempt.id, questionCount=attempt.question_count)


@router.post("/{attempt_id}/questions/{question_index}/grade", response_model=GradeResult)
def grade_question(
    attempt_id: str,
    question_index: int,
    payload: AttemptGradeRequest,
    db: Session = Depends(get_db),
    student: User = Depends(require_student),
):
    attempt = _own_attempt(db, attempt_id, student)
    if attempt.result_id:
        raise HTTPException(status.HTTP_409_CONFLICT, "This attempt is already finished")
    if question_index < 0 or question_index >= attempt.question_count:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Question index out of range")
    if any(a.question_index == question_index for a in attempt.answers):
        raise HTTPException(status.HTTP_409_CONFLICT, "This question has already been answered")

    paper = db.get(TestPaper, attempt.paper_id)
    if paper is None or question_index >= len(paper.questions):
        raise HTTPException(status.HTTP_409_CONFLICT, "This paper is no longer available")

    # The rubric is read server-side from the DB — never trust a client-supplied one.
    question = paper.questions[question_index]
    graded = evaluate_answer_llm(question, payload.transcript) or evaluate_answer(question, payload.transcript)

    db.add(AttemptAnswer(
        attempt_id=attempt.id,
        question_index=question_index,
        status=graded["status"],
        score=graded["score"],
        max_score=graded["maxScore"],
        topic_tag=graded["topicTag"],
        retry_count=payload.retryCount,
    ))
    try:
        db.commit()
    except IntegrityError:
        # Two simultaneous requests for the same question: the unique
        # constraint let exactly one through.
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "This question has already been answered")
    return GradeResult(**graded)


@router.post("/{attempt_id}/finish", response_model=ResultOut)
def finish_attempt(attempt_id: str, db: Session = Depends(get_db), student: User = Depends(require_student)):
    attempt = _own_attempt(db, attempt_id, student)

    # Idempotent: a retried request gets the same result back, never a second row.
    if attempt.result_id:
        return to_out(db.get(Result, attempt.result_id))

    answers = attempt.answers
    if len(answers) < attempt.question_count:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Answer every question before finishing")

    total = sum(a.score for a in answers)
    max_total = sum(a.max_score for a in answers)
    score_pct = int(total * 100 / max(max_total, 1) + 0.5)

    correct = sum(1 for a in answers if a.status == "correct")
    partial = sum(1 for a in answers if a.status == "partially_correct")
    wrong = len(answers) - correct - partial

    topics: list[str] = []
    for a in sorted(answers, key=lambda x: x.question_index):
        if a.status != "correct" and a.topic_tag not in topics:
            topics.append(a.topic_tag)

    # The retry counts come from the client and only colour this soft note;
    # they never touch the score.
    total_retries = sum(a.retry_count or 0 for a in answers)
    if total_retries >= 3:
        note = "FLAGGED: Low audio clarity / multiple retries triggered during spoken responses."
    elif total_retries >= 1:
        note = "Soft clarity note: Slight background noise or soft enunciation detected."
    else:
        note = "Vocal clarity and pacing within expected parameters."

    result = Result(
        student_user_id=student.id,
        student_id=student.student_id,
        student_name=student.student_name,
        grade_level=student.grade_level,
        subject_id=attempt.subject_id,
        test_title=attempt.paper_title,
        date=datetime.utcnow().strftime("%Y-%m-%d %H:%M"),
        score=score_pct,
        max_score=100,
        correct_count=correct,
        partial_count=partial,
        wrong_count=wrong,
        struggling_topics=topics,
        pronunciation_note=note,
        status="Pass" if score_pct >= PASS_MARK else "Needs Review",
    )
    db.add(result)
    db.flush()
    attempt.result_id = result.id
    db.commit()
    db.refresh(result)
    return to_out(result)
