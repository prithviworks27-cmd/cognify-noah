from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.config import settings
from app.database import get_db
from app.deps import get_current_principal, Principal
from app.models import User
from app.schemas import AdminLoginRequest, LoginRequest, StudentSignupRequest, TokenResponse, UserOut
from app.security import create_access_token, hash_password, verify_password

router = APIRouter(prefix="/api/auth", tags=["auth"])


def _student_user_out(user: User) -> UserOut:
    return UserOut(
        role="student",
        email=user.email,
        studentName=user.student_name,
        studentId=user.student_id,
        gradeLevel=user.grade_level,
    )


@router.post("/signup", response_model=TokenResponse)
def signup(payload: StudentSignupRequest, db: Session = Depends(get_db)):
    if db.query(User).filter(User.email == payload.email).first():
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An account with this email already exists")
    user = User(
        email=payload.email,
        hashed_password=hash_password(payload.password),
        student_name=payload.student_name,
        student_id=payload.student_id,
        grade_level=payload.grade_level,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user.id, "student")
    return TokenResponse(token=token, user=_student_user_out(user))


@router.post("/login", response_model=TokenResponse)
def login(payload: LoginRequest, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == payload.email).first()
    if not user or not verify_password(payload.password, user.hashed_password):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    token = create_access_token(user.id, "student")
    return TokenResponse(token=token, user=_student_user_out(user))


@router.post("/admin-login", response_model=TokenResponse)
def admin_login(payload: AdminLoginRequest):
    if payload.passkey != settings.admin_passkey:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid admin passkey")
    token = create_access_token("admin", "admin")
    return TokenResponse(token=token, user=UserOut(role="admin", adminName="Institute Admin"))


@router.get("/me", response_model=UserOut)
def me(principal: Principal = Depends(get_current_principal)):
    if principal.role == "admin":
        return UserOut(role="admin", adminName="Institute Admin")
    return _student_user_out(principal.user)
