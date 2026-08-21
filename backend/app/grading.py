"""
Server-side port of js/grading_engine.js — identical logic, kept here so the
rubric (keywords/acceptedAnswers) never has to be sent to the student's
browser to be graded.
"""
import json
import re

import requests

from app.config import settings

GEMINI_MODEL = "gemini-3.6-flash"
GEMINI_URL = f"https://generativelanguage.googleapis.com/v1beta/models/{GEMINI_MODEL}:generateContent"

GRADE_RESPONSE_SCHEMA = {
    "type": "object",
    "properties": {
        "status": {"type": "string", "enum": ["correct", "partially_correct", "incorrect"]},
        "score": {"type": "integer"},
        "confidence": {"type": "number"},
        "feedback": {"type": "string"},
        "matchedKeywords": {"type": "array", "items": {"type": "string"}},
        "missingKeywords": {"type": "array", "items": {"type": "string"}},
    },
    "required": ["status", "score", "confidence", "feedback", "matchedKeywords", "missingKeywords"],
}


def evaluate_answer_llm(question: dict, transcript: str) -> dict | None:
    """Grades via Gemini. Returns None on any failure (missing key, network,
    rate limit, malformed response) so the caller falls back to the
    deterministic evaluate_answer() instead of failing the exam."""
    if not settings.gemini_api_key:
        return None

    points = question.get("points") or 10
    keywords = question.get("keywords") or []
    accepted_answers = question.get("acceptedAnswers") or []
    topic_tag = question.get("topicTag") or "General Knowledge"
    question_text = question.get("text") or ""

    if not transcript or not transcript.strip():
        return None  # let the deterministic grader handle the trivial empty-answer case

    prompt = f"""You are NOAH, a strict but fair AI oral examiner grading a student's spoken answer.

Question: {question_text}
Maximum points: {points}
Acceptable reference answers: {accepted_answers}
Key concepts expected: {keywords}
Student's spoken answer (transcribed): "{transcript}"

Grade the student's answer. Judge on understanding and correctness, not exact wording —
accept paraphrasing and synonyms. "correct" only if the core concept is explained accurately
and completely. "partially_correct" if some but not all key ideas are present. "incorrect" if
the answer is wrong, off-topic, or too vague/incomplete.

Respond in NOAH's voice: terse, formal, exam-officer tone (e.g. "Affirmative. Precise and
complete response..." or "Incorrect response. Essential details regarding X were missing.").

score must be an integer from 0 to {points} ({points} for correct, roughly half for
partially_correct, 0 for incorrect). confidence is your certainty in this judgment, 0 to 1.
matchedKeywords/missingKeywords should be drawn only from: {keywords}."""

    try:
        resp = requests.post(
            GEMINI_URL,
            params={"key": settings.gemini_api_key},
            json={
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json",
                    "responseSchema": GRADE_RESPONSE_SCHEMA,
                    "temperature": 0.2,
                },
            },
            # gemini-3.6-flash is a thinking model with variable response time
            # (observed 4-9s+ even for trivial prompts) — 8s was cutting off
            # real, in-progress responses and silently falling back.
            timeout=25,
        )
        resp.raise_for_status()
        text = resp.json()["candidates"][0]["content"]["parts"][0]["text"]
        result = json.loads(text)

        return {
            "status": result["status"],
            "score": max(0, min(int(result["score"]), points)),
            "maxScore": points,
            "confidence": max(0.0, min(float(result["confidence"]), 1.0)),
            "feedback": result["feedback"],
            "matchedKeywords": result.get("matchedKeywords") or [],
            "missingKeywords": result.get("missingKeywords") or [],
            "topicTag": topic_tag,
        }
    except Exception:
        return None


EXPLANATORY_PHRASES = [
    "is a", "is an", "are", "caused by", "used to", "means", "defined as",
    "process of", "refers to", "occurs when", "equal to", "equals", "result of", "due to",
]


def _clean(text: str) -> str:
    return re.sub(r"[^\w\s]", "", text.lower()).strip()


def evaluate_answer(question: dict, transcript: str) -> dict:
    points = question.get("points") or 10
    keywords = question.get("keywords") or []
    accepted_answers = question.get("acceptedAnswers") or []
    topic_tag = question.get("topicTag") or "General Knowledge"

    if not transcript or not transcript.strip():
        return {
            "status": "incorrect",
            "score": 0,
            "maxScore": points,
            "confidence": 0,
            "feedback": "No response received. Question marked as incorrect.",
            "matchedKeywords": [],
            "missingKeywords": keywords,
            "topicTag": topic_tag,
        }

    clean_transcript = _clean(transcript)
    words = [w for w in clean_transcript.split() if w]

    # 1. Lazy single-word answers
    if len(words) < 3:
        matched = [kw for kw in keywords if kw.lower() in clean_transcript]
        return {
            "status": "incorrect",
            "score": 0,
            "maxScore": points,
            "confidence": 0.1,
            "feedback": (
                f'Incomplete response. Simply stating the term "{clean_transcript}" is '
                "insufficient. You must provide a full spoken explanation."
            ),
            "matchedKeywords": matched,
            "missingKeywords": keywords,
            "topicTag": topic_tag,
        }

    # 2. Keyword matching & coverage
    matched_keywords = []
    missing_keywords = []
    for kw in keywords:
        if kw.lower() in clean_transcript:
            matched_keywords.append(kw)
        else:
            missing_keywords.append(kw)
    keyword_coverage_ratio = (len(matched_keywords) / len(keywords)) if keywords else 0

    # 3. Phrase/explanation completeness via Jaccard word overlap against accepted answers
    highest_similarity_ratio = 0.0
    trans_set = set(words)
    for ans in accepted_answers:
        ans_words = [w for w in _clean(ans).split() if w]
        if not ans_words:
            continue
        intersection = sum(1 for w in ans_words if w in trans_set)
        similarity = intersection / max(len(ans_words), 1)
        highest_similarity_ratio = max(highest_similarity_ratio, similarity)

    has_explanatory_structure = any(phrase in clean_transcript for phrase in EXPLANATORY_PHRASES)

    combined_score = (
        (keyword_coverage_ratio * 0.5)
        + (highest_similarity_ratio * 0.3)
        + (0.2 if has_explanatory_structure else 0)
    )

    if (
        combined_score >= 0.55
        and len(words) >= 4
        and (keyword_coverage_ratio >= 0.5 or highest_similarity_ratio >= 0.5)
    ):
        status = "correct"
        score = points
        matched_preview = ", ".join(matched_keywords[:3]) or "essential parameters"
        feedback = (
            f"Affirmative. Precise and complete response. You correctly defined the "
            f"concept including {matched_preview}."
        )
    elif matched_keywords or len(words) >= 4:
        status = "partially_correct"
        score = round(points * 0.5)
        matched_preview = ", ".join(matched_keywords) or "some concepts"
        missing_preview = " or ".join(missing_keywords[:2]) or "the complete definition"
        feedback = (
            f"Partially correct. You identified key terms like {matched_preview}, but "
            f"your explanation lacked full detail regarding {missing_preview}."
        )
    else:
        status = "incorrect"
        score = 0
        feedback = (
            "Incorrect response. Essential explanatory details and key parameters like "
            f"{', '.join(keywords[:2])} were missing."
        )

    return {
        "status": status,
        "score": score,
        "maxScore": points,
        "confidence": round(combined_score, 2),
        "feedback": feedback,
        "matchedKeywords": matched_keywords,
        "missingKeywords": missing_keywords,
        "topicTag": topic_tag,
    }
