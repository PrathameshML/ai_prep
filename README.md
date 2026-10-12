# 🧬 SkillDNA
AI-based student skill assessment, career recommendation and personalized career roadmap.

**Stack:** HTML + Tailwind + JS (frontend) · Python Flask (backend) · MongoDB Atlas (database) · Groq LLM (AI) · PyPDF (resume parsing)

## Run
```bash
cd backend
pip install -r requirements.txt
cp .env.example .env   # then put your GROQ_API_KEY and MONGODB_URI in .env
python app.py
```
Open http://localhost:5000

## Flow
Register → Profile & Projects → Resume Upload (AI skill extraction) → AI Assessment (5 MCQs per skill)
→ SkillDNA Result (final score = 70% test + 30% resume/project evidence → Strong / Good / Developing / Weak)
→ Career Recommendation (readiness %) → Select Target Career → Skill Gap + Roadmap → Progress tracking
