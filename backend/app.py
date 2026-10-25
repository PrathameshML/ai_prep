import os
import json
import uuid
from functools import wraps

from dotenv import load_dotenv
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from pymongo import MongoClient
from groq import Groq
from pypdf import PdfReader
from werkzeug.security import generate_password_hash, check_password_hash

load_dotenv(os.path.join(os.path.dirname(__file__), ".env"))

FRONTEND = os.path.join(os.path.dirname(__file__), "..", "frontend")
app = Flask(__name__, static_folder=FRONTEND, static_url_path="")
CORS(app)

MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b")
_db = None
_groq = None


def db():
    global _db
    if _db is None:
        uri = os.getenv("MONGODB_URI")
        if not uri:
            raise RuntimeError("MONGODB_URI missing in backend/.env")
        _db = MongoClient(uri)[os.getenv("MONGODB_DB", "skilldna")]
    return _db


def groq():
    global _groq
    if _groq is None:
        key = os.getenv("GROQ_API_KEY")
        if not key:
            raise RuntimeError("GROQ_API_KEY missing in backend/.env")
        _groq = Groq(api_key=key)
    return _groq


def ai_json(prompt, temperature=0.4):
    res = groq().chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": "You are SkillDNA, an expert AI career counsellor for engineering students. Always respond ONLY with valid JSON."},
            {"role": "user", "content": prompt},
        ],
        response_format={"type": "json_object"},
        temperature=temperature,
    )
    return json.loads(res.choices[0].message.content)


def level(score):
    if score >= 80:
        return "Strong"
    if score >= 60:
        return "Good"
    if score >= 40:
        return "Developing"
    return "Weak"


def public(user):
    u = {k: v for k, v in user.items() if k not in ("_id", "password", "token", "pending_assessment")}
    return u


def auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
        user = db().users.find_one({"token": token}) if token else None
        if not user:
            return jsonify(error="Please login again"), 401
        return fn(user, *args, **kwargs)
    return wrapper


@app.errorhandler(Exception)
def handle_error(e):
    code = getattr(e, "code", 500)
    if not isinstance(code, int):
        code = 500
    return jsonify(error=str(e)), code


@app.route("/")
def index():
    return send_from_directory(FRONTEND, "index.html")


# ---------- Auth ----------
@app.post("/api/register")
def register():
    d = request.json or {}
    email = (d.get("email") or "").strip().lower()
    if not email or not d.get("password") or not d.get("name"):
        return jsonify(error="Name, email and password are required"), 400
    if db().users.find_one({"email": email}):
        return jsonify(error="Email already registered"), 400
    token = uuid.uuid4().hex
    db().users.insert_one({
        "name": d["name"].strip(), "email": email,
        "password": generate_password_hash(d["password"]), "token": token,
        "education": "", "branch": "", "year": "", "skills": [], "projects": [],
        "resume_skills": [], "scores": [], "careers": [], "roadmap": None, "progress": [],
    })
    return jsonify(token=token)


@app.post("/api/login")
def login():
    d = request.json or {}
    user = db().users.find_one({"email": (d.get("email") or "").strip().lower()})
    if not user or not check_password_hash(user["password"], d.get("password", "")):
        return jsonify(error="Invalid email or password"), 401
    token = uuid.uuid4().hex
    db().users.update_one({"_id": user["_id"]}, {"$set": {"token": token}})
    return jsonify(token=token)


@app.get("/api/me")
@auth
def me(user):
    return jsonify(public(user))


# ---------- Profile ----------
@app.post("/api/profile")
@auth
def profile(user):
    d = request.json or {}
    skills = [s.strip() for s in d.get("skills", []) if s.strip()]
    projects = [p for p in d.get("projects", []) if (p.get("name") or "").strip()]
    db().users.update_one({"_id": user["_id"]}, {"$set": {
        "name": d.get("name", user["name"]), "education": d.get("education", ""),
        "branch": d.get("branch", ""), "year": d.get("year", ""),
        "skills": list(dict.fromkeys(skills)), "projects": projects,
    }})
    return jsonify(ok=True)


# ---------- Resume ----------
@app.post("/api/resume")
@auth
def resume(user):
    f = request.files.get("resume")
    if not f:
        return jsonify(error="Upload a PDF resume"), 400
    text = "\n".join((p.extract_text() or "") for p in PdfReader(f.stream).pages)[:12000]
    if not text.strip():
        return jsonify(error="Could not read text from this PDF"), 400
    out = ai_json(
        "Extract technical skills from this resume. Return JSON: "
        '{"skills": ["Python", ...], "summary": "2 line profile summary", '
        '"projects": [{"name": "", "description": "", "tech": "comma separated"}]}\n\nRESUME:\n' + text
    )
    resume_skills = [s for s in out.get("skills", []) if isinstance(s, str)]
    merged = list(dict.fromkeys(user.get("skills", []) + resume_skills))
    update = {"resume_skills": resume_skills, "resume_summary": out.get("summary", ""), "skills": merged}
    if not user.get("projects") and out.get("projects"):
        update["projects"] = out["projects"]
    db().users.update_one({"_id": user["_id"]}, {"$set": update})
    return jsonify(skills=resume_skills, summary=out.get("summary", ""), projects=out.get("projects", []))


# ---------- Assessment ----------
@app.post("/api/assessment/start")
@auth
def start_assessment(user):
    skills = (request.json or {}).get("skills") or user.get("skills", [])[:5]
    skills = skills[:5]
    if not skills:
        return jsonify(error="Add skills in your profile first"), 400
    out = ai_json(
        f"Create a skill assessment for a {user.get('year', '')} year {user.get('branch', '')} student. "
        f"Write exactly 15 multiple choice questions total for these skills: {skills}. "
        "Distribute the questions as evenly as possible across the selected skills, "
        "with mixed difficulty (roughly 40% easy, 40% medium, 20% hard), practical and concept based. "
        "Return JSON: "
        '{"questions": [{"skill": "<skill>", "question": "", "options": ["a","b","c","d"], "answer": <correct option index 0-3>}]}',
        temperature=0.7,
    )
    questions = []
    for q in out.get("questions", []):
        if (
            isinstance(q, dict)
            and isinstance(q.get("options"), list)
            and len(q["options"]) == 4
            and isinstance(q.get("answer"), int)
            and not isinstance(q.get("answer"), bool)
            and 0 <= q["answer"] <= 3
        ):
            q["id"] = uuid.uuid4().hex[:8]
            questions.append(q)
    if len(questions) < 15:
        return jsonify(error="AI returned an incomplete assessment. Please try again."), 502
    questions = questions[:15]
    db().users.update_one({"_id": user["_id"]}, {"$set": {"pending_assessment": questions}})
    return jsonify(questions=[{k: q[k] for k in ("id", "skill", "question", "options")} for q in questions])


@app.post("/api/assessment/submit")
@auth
def submit_assessment(user):
    answers = (request.json or {}).get("answers", {})
    questions = user.get("pending_assessment") or []
    if not questions:
        return jsonify(error="Start an assessment first"), 400
    resume_sk = {s.lower() for s in user.get("resume_skills", [])}
    project_text = " ".join(f"{p.get('name','')} {p.get('description','')} {p.get('tech','')}" for p in user.get("projects", [])).lower()

    per = {}
    review = []
    for q in questions:
        s = per.setdefault(q["skill"], {"correct": 0, "total": 0})
        s["total"] += 1
        given = answers.get(q["id"])
        ok = given is not None and int(given) == q["answer"]
        s["correct"] += ok
        review.append({"question": q["question"], "skill": q["skill"], "correct": ok,
                       "answer": q["options"][q["answer"]],
                       "given": q["options"][int(given)] if given is not None else None})

    scores = []
    for skill, s in per.items():
        test = round(100 * s["correct"] / s["total"])
        # Evidence score: resume + project proof of the skill
        evidence = 20 + (40 if skill.lower() in resume_sk else 0) + (40 if skill.lower() in project_text else 0)
        final = round(0.7 * test + 0.3 * evidence)
        scores.append({"skill": skill, "correct": s["correct"], "total": s["total"], "test_score": test,
                       "evidence_score": evidence, "score": final, "level": level(final)})
    scores.sort(key=lambda x: -x["score"])
    db().users.update_one({"_id": user["_id"]}, {"$set": {"scores": scores}, "$unset": {"pending_assessment": ""}})
    return jsonify(scores=scores, review=review)


# ---------- Careers ----------
@app.post("/api/careers")
@auth
def careers(user):
    if not user.get("scores"):
        return jsonify(error="Complete the assessment first"), 400
    out = ai_json(
        "Recommend the 5 best career roles for this student. Readiness is 0-100 based mainly on the skill scores. "
        'Return JSON: {"careers": [{"role": "", "readiness": 0, "reason": "", "matched_skills": [], "missing_skills": [], "avg_salary_india": ""}]} '
        "sorted by readiness descending.\n\n" + json.dumps({
            "education": user.get("education"), "branch": user.get("branch"), "year": user.get("year"),
            "skill_scores": [{"skill": s["skill"], "score": s["score"], "level": s["level"]} for s in user["scores"]],
            "other_skills": user.get("skills"), "projects": user.get("projects"),
            "resume_summary": user.get("resume_summary", ""),
        })
    )
    result = sorted(out.get("careers", []), key=lambda c: -int(c.get("readiness", 0)))
    db().users.update_one({"_id": user["_id"]}, {"$set": {"careers": result}})
    return jsonify(careers=result)


# ---------- Roadmap ----------
@app.post("/api/roadmap")
@auth
def roadmap(user):
    career = ((request.json or {}).get("career") or "").strip()
    if not career:
        return jsonify(error="Select a target career"), 400
    out = ai_json(
        f"The student's target career is '{career}'. Compare their skills with the skills required for this role and build a personalized roadmap. "
        'Return JSON: {"career": "", "readiness": 0, "gaps": [{"skill": "", "status": "have|partial|missing", "note": ""}], '
        '"steps": [{"title": "", "description": "", "duration": "e.g. 2 weeks", "topics": [], "resources": [], "project_idea": ""}]} '
        "with 6-8 ordered steps, starting from their weak areas and ending with portfolio/resume/interview prep.\n\n" + json.dumps({
            "skill_scores": user.get("scores"), "skills": user.get("skills"), "projects": user.get("projects"),
            "branch": user.get("branch"), "year": user.get("year"),
        })
    )
    out["career"] = career
    db().users.update_one({"_id": user["_id"]}, {"$set": {"roadmap": out, "progress": []}})
    return jsonify(roadmap=out)


@app.post("/api/progress")
@auth
def progress(user):
    d = request.json or {}
    step, done = int(d.get("step", -1)), bool(d.get("done"))
    op = "$addToSet" if done else "$pull"
    db().users.update_one({"_id": user["_id"]}, {op: {"progress": step}})
    return jsonify(ok=True)


if __name__ == "__main__":
    app.run(debug=True, port=int(os.getenv("PORT", 5000)))
