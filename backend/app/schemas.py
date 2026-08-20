from datetime import datetime

from pydantic import BaseModel, EmailStr


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

class ResultCreate(BaseModel):
    subjectId: str | None = None
    testTitle: str
    date: str
    score: int
    maxScore: int = 100
    correctCount: int = 0
    partialCount: int = 0
    wrongCount: int = 0
    strugglingTopics: list[str] = []
    pronunciationNote: str | None = None
    status: str


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
