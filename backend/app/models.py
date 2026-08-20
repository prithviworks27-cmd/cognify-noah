import uuid
from datetime import datetime

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, JSON, String
from sqlalchemy.orm import relationship

from app.database import Base


def gen_id() -> str:
    return uuid.uuid4().hex


class User(Base):
    __tablename__ = "users"

    id = Column(String, primary_key=True, default=gen_id)
    email = Column(String, unique=True, index=True, nullable=False)
    hashed_password = Column(String, nullable=False)
    student_name = Column(String, nullable=False)
    student_id = Column(String, nullable=False)
    grade_level = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    results = relationship("Result", back_populates="student", cascade="all, delete-orphan")


class TestPaper(Base):
    __tablename__ = "test_papers"

    id = Column(String, primary_key=True, default=gen_id)
    subject_id = Column(String, nullable=True)
    title = Column(String, nullable=False)
    grade_level = Column(String, nullable=False)
    active = Column(Boolean, default=True)
    duration_minutes = Column(Integer, default=10)
    questions = Column(JSON, nullable=False, default=list)
    created_at = Column(DateTime, default=datetime.utcnow)


class Result(Base):
    __tablename__ = "results"

    id = Column(String, primary_key=True, default=gen_id)
    student_user_id = Column(String, ForeignKey("users.id"), nullable=False)
    student_id = Column(String, nullable=False)
    student_name = Column(String, nullable=False)
    grade_level = Column(String, nullable=False)
    subject_id = Column(String, nullable=True)
    test_title = Column(String, nullable=False)
    date = Column(String, nullable=False)
    score = Column(Integer, default=0)
    max_score = Column(Integer, default=100)
    correct_count = Column(Integer, default=0)
    partial_count = Column(Integer, default=0)
    wrong_count = Column(Integer, default=0)
    struggling_topics = Column(JSON, default=list)
    pronunciation_note = Column(String, nullable=True)
    status = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    student = relationship("User", back_populates="results")
