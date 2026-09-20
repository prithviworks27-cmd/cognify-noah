from pydantic import BaseModel, EmailStr, Field


# ---- Auth ----

class StudentSignupRequest(BaseModel):
    email: EmailStr
    password: str
    student_name: str
    student_id: str
    grade_level: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class AdminLoginRequest(BaseModel):
    passkey: str


class UserOut(BaseModel):
    role: str = "student"
    email: str | None = None
    studentName: str | None = None
    studentId: str | None = None
    gradeLevel: str | None = None
    adminName: str | None = None


class TokenResponse(BaseModel):
    token: str
    user: UserOut


# ---- Papers ----

class QuestionIn(BaseModel):
    text: str
    points: int = 10
    keywords: list[str] = []
    acceptedAnswers: list[str] = []
    topicTag: str = "General Knowledge"


class GradeResult(BaseModel):
    status: str
    score: int
    maxScore: int
    confidence: float
    feedback: str
    matchedKeywords: list[str]
    missingKeywords: list[str]
    topicTag: str


class PaperCreate(BaseModel):
    id: str | None = None
    subjectId: str | None = None
    title: str
    gradeLevel: str
    active: bool = True
    durationMinutes: int = 10
    questions: list[QuestionIn]


class PaperOut(BaseModel):
    id: str
    subjectId: str | None = None
    title: str
    gradeLevel: str
    active: bool
    durationMinutes: int
    questions: list[dict]

    class Config:
        from_attributes = True


# ---- Results ----

class ResultOut(BaseModel):
    id: str
    studentId: str
    studentName: str
    gradeLevel: str
    subjectId: str | None = None
    testTitle: str
    date: str
    score: int
    maxScore: int
    correctCount: int
    partialCount: int
    wrongCount: int
    strugglingTopics: list[str]
    pronunciationNote: str | None = None
    status: str

    class Config:
        from_attributes = True


# ---- Exam attempts ----

class AttemptStart(BaseModel):
    paperId: str


class AttemptOut(BaseModel):
    attemptId: str
    questionCount: int


class AttemptGradeRequest(BaseModel):
    # Capped so a single request can't push an arbitrarily large prompt at the
    # grader (LLM cost) — a spoken answer is nowhere near this long.
    transcript: str = Field(max_length=4000)
    retryCount: int = Field(default=0, ge=0, le=10)
