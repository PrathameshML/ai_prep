const API = "/api";
let token = localStorage.getItem("token");
let me = null;
let authMode = "login";
let currentQuestions = [];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- helpers ----------
async function api(path, opts = {}) {
  const headers = opts.body instanceof FormData ? {} : { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const res = await fetch(API + path, { ...opts, headers });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && path !== "/login") { logout(); }
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}
function loading(on, text = "AI is thinking...") {
  $("loaderText").textContent = text;
  $("loader").classList.toggle("hidden", !on);
}
function toast(msg, ok = true) {
  const t = $("toast");
  t.textContent = msg;
  t.className = `fixed top-4 right-4 z-50 px-4 py-3 rounded-lg text-white shadow-lg ${ok ? "bg-emerald-600" : "bg-red-600"}`;
  setTimeout(() => t.classList.add("hidden"), 3000);
}
async function run(fn, text) {
  loading(true, text);
  try { return await fn(); } catch (e) { toast(e.message, false); } finally { loading(false); }
}
const levelColor = (l) => ({ Strong: "bg-emerald-500", Good: "bg-sky-500", Developing: "bg-amber-500", Weak: "bg-red-500" }[l] || "bg-slate-400");
const levelBadge = (l) => ({ Strong: "bg-emerald-100 text-emerald-700", Good: "bg-sky-100 text-sky-700", Developing: "bg-amber-100 text-amber-700", Weak: "bg-red-100 text-red-700" }[l] || "bg-slate-100");
const header = (title, sub) => `<h2 class="text-2xl md:text-3xl font-bold">${title}</h2><p class="text-slate-500 mb-6">${sub}</p>`;
const btn = "bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-lg font-semibold";
const input = "w-full border border-slate-300 rounded-lg px-3 py-2 focus:outline-indigo-500";

// ---------- auth ----------
function setAuthMode(m) {
  authMode = m;
  $("aName").classList.toggle("hidden", m === "login");
  $("tabLogin").classList.toggle("bg-white", m === "login");
  $("tabLogin").classList.toggle("shadow", m === "login");
  $("tabRegister").classList.toggle("bg-white", m === "register");
  $("tabRegister").classList.toggle("shadow", m === "register");
}
$("authForm").onsubmit = (e) => {
  e.preventDefault();
  run(async () => {
    const body = { name: $("aName").value, email: $("aEmail").value, password: $("aPass").value };
    const d = await api("/" + authMode, { method: "POST", body: JSON.stringify(body) });
    token = d.token;
    localStorage.setItem("token", token);
    await boot();
  }, "Signing in...");
};
function logout() {
  token = null; me = null;
  localStorage.removeItem("token");
  $("appView").classList.add("hidden");
  $("authView").classList.remove("hidden");
}

// ---------- navigation ----------
const pages = {
  dashboard: ["🏠", "Dashboard"],
  profile: ["🧑‍🎓", "Profile & Projects"],
  resume: ["📄", "Resume Upload"],
  assessment: ["📝", "AI Assessment"],
  results: ["🧬", "SkillDNA Result"],
  careers: ["🎯", "Careers"],
  roadmap: ["🗺️", "Roadmap & Progress"],
};
function renderNav(active) {
  $("nav").innerHTML = Object.entries(pages).map(([k, [i, l]]) =>
    `<button onclick="go('${k}')" class="text-left px-3 py-2 rounded-lg whitespace-nowrap ${k === active ? "bg-indigo-600 text-white" : "hover:bg-slate-800"}">${i} ${l}</button>`).join("");
}
async function refresh() { me = await api("/me"); }
function go(page) {
  renderNav(page);
  views[page]();
  window.scrollTo(0, 0);
}
async function boot() {
  try { await refresh(); } catch { return logout(); }
  $("authView").classList.add("hidden");
  $("appView").classList.remove("hidden");
  go("dashboard");
}

// ---------- views ----------
const views = {
  dashboard() {
    const top = me.careers?.[0];
    const rm = me.roadmap;
    const pct = rm ? Math.round((me.progress.length / rm.steps.length) * 100) : 0;
    const steps = [
      ["Profile", !!(me.branch && me.skills.length), "profile"],
      ["Resume", me.resume_skills.length > 0, "resume"],
      ["Assessment", me.scores.length > 0, "assessment"],
      ["Careers", me.careers.length > 0, "careers"],
      ["Roadmap", !!rm, "roadmap"],
    ];
    $("view").innerHTML = `
      ${header(`Hi, ${esc(me.name)} 👋`, "Your SkillDNA journey at a glance")}
      <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        ${[["Skills", me.skills.length], ["Projects", me.projects.length], ["Assessed", me.scores.length], ["Roadmap", pct + "%"]]
          .map(([l, v]) => `<div class="card"><p class="text-slate-500 text-sm">${l}</p><p class="text-3xl font-bold text-indigo-600">${v}</p></div>`).join("")}
      </div>
      <div class="card mb-6">
        <h3 class="font-semibold mb-4">Your progress flow</h3>
        <div class="flex flex-wrap items-center gap-2">
          ${steps.map(([l, done, p], i) => `
            <button onclick="go('${p}')" class="px-4 py-2 rounded-full text-sm font-medium ${done ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600"}">${done ? "✓" : i + 1} ${l}</button>
            ${i < steps.length - 1 ? '<span class="text-slate-400">→</span>' : ""}`).join("")}
        </div>
      </div>
      <div class="grid md:grid-cols-2 gap-4">
        <div class="card">
          <h3 class="font-semibold mb-3">Top skills</h3>
          ${me.scores.length ? me.scores.slice(0, 5).map(skillBar).join("") : `<p class="text-slate-500">Take the AI assessment to see your scores.</p>`}
        </div>
        <div class="card">
          <h3 class="font-semibold mb-3">Best career match</h3>
          ${top ? `<p class="text-xl font-bold">${esc(top.role)}</p><p class="text-4xl font-extrabold text-indigo-600 my-2">${top.readiness}%</p><p class="text-slate-600 text-sm">${esc(top.reason)}</p>`
                : `<p class="text-slate-500">Complete the assessment to get recommendations.</p>`}
          ${rm ? `<p class="mt-4 text-sm">🎯 Target: <b>${esc(rm.career)}</b> — ${pct}% complete</p>` : ""}
        </div>
      </div>`;
  },

  profile() {
    $("view").innerHTML = `
      ${header("Student Profile", "Basic information, skills and projects")}
      <div class="card mb-6 grid md:grid-cols-2 gap-4">
        <div><label class="text-sm font-medium">Name</label><input id="pName" class="${input}" value="${esc(me.name)}"></div>
        <div><label class="text-sm font-medium">Education</label><input id="pEdu" class="${input}" placeholder="B.Tech / BE / BCA / MCA" value="${esc(me.education)}"></div>
        <div><label class="text-sm font-medium">Branch</label><input id="pBranch" class="${input}" placeholder="Computer Science" value="${esc(me.branch)}"></div>
        <div><label class="text-sm font-medium">Year</label>
          <select id="pYear" class="${input}">${["", "1st", "2nd", "3rd", "4th", "Graduate"].map((y) => `<option ${me.year === y ? "selected" : ""}>${y}</option>`).join("")}</select></div>
        <div class="md:col-span-2"><label class="text-sm font-medium">Skills (comma separated)</label>
          <input id="pSkills" class="${input}" placeholder="Python, Java, SQL, Flutter" value="${esc(me.skills.join(", "))}"></div>
      </div>
      <div class="card mb-6">
        <div class="flex justify-between items-center mb-4"><h3 class="font-semibold">Projects</h3>
          <button onclick="addProject()" class="text-indigo-600 font-medium">+ Add project</button></div>
        <div id="projects" class="space-y-4"></div>
      </div>
      <button onclick="saveProfile()" class="${btn}">Save Profile</button>`;
    (me.projects.length ? me.projects : [{}]).forEach(addProject);
  },

  resume() {
    $("view").innerHTML = `
      ${header("Upload Resume", "AI extracts skills and projects from your PDF resume")}
      <div class="card mb-6">
        <label class="flex flex-col items-center justify-center border-2 border-dashed border-indigo-300 rounded-xl p-10 cursor-pointer hover:bg-indigo-50">
          <span class="text-5xl">📄</span><span id="fileName" class="mt-2 font-medium">Click to choose your resume (PDF)</span>
          <input id="resumeFile" type="file" accept="application/pdf" class="hidden" onchange="$('fileName').textContent=this.files[0]?.name">
        </label>
        <button onclick="uploadResume()" class="${btn} mt-4">Analyze Resume</button>
      </div>
      <div id="resumeOut">${me.resume_skills.length ? resumeResult(me.resume_skills, me.resume_summary) : ""}</div>`;
  },

  assessment() {
    $("view").innerHTML = `
      ${header("AI Skill Assessment", "Pick up to 5 skills — AI generates 15 questions total")}
      <div class="card mb-6">
        ${me.skills.length ? `
          <div class="flex flex-wrap gap-2 mb-4">${me.skills.map((s, i) => `
            <label class="flex items-center gap-2 px-3 py-1.5 border rounded-full cursor-pointer has-[:checked]:bg-indigo-600 has-[:checked]:text-white">
              <input type="checkbox" class="skillPick hidden" value="${esc(s)}" ${i < 5 ? "checked" : ""}>${esc(s)}</label>`).join("")}</div>
          <button onclick="startAssessment()" class="${btn}">Generate Assessment</button>`
          : `<p>Add skills in your <button class="text-indigo-600 underline" onclick="go('profile')">profile</button> or <button class="text-indigo-600 underline" onclick="go('resume')">upload resume</button> first.</p>`}
      </div>
      <div id="quiz"></div>`;
  },

  results() {
    if (!me.scores.length) {
      $("view").innerHTML = header("SkillDNA Result", "No results yet") + `<button onclick="go('assessment')" class="${btn}">Take Assessment</button>`;
      return;
    }
    const strengths = me.scores.filter((s) => s.score >= 60);
    const weak = me.scores.filter((s) => s.score < 60);
    const overall = Math.round(me.scores.reduce((a, s) => a + s.score, 0) / me.scores.length);
    $("view").innerHTML = `
      ${header("🧬 Your SkillDNA", "Final score = 70% assessment + 30% resume/project evidence")}
      <div class="card mb-6 flex items-center gap-6">
        <div class="text-5xl font-extrabold text-indigo-600">${overall}%</div>
        <div><p class="font-semibold">Overall Skill Index</p><p class="text-slate-500 text-sm">Level: ${levelOf(overall)}</p></div>
      </div>
      <div class="card mb-6"><h3 class="font-semibold mb-4">Skill scores</h3>${me.scores.map(skillBar).join("")}
        <table class="w-full text-sm mt-4"><thead><tr class="text-left text-slate-500"><th>Skill</th><th>Test</th><th>Evidence</th><th>Final</th><th>Level</th></tr></thead>
        <tbody>${me.scores.map((s) => `<tr class="border-t"><td class="py-2">${esc(s.skill)}</td><td>${s.correct}/${s.total} (${s.test_score}%)</td><td>${s.evidence_score}%</td><td class="font-bold">${s.score}%</td>
          <td><span class="px-2 py-0.5 rounded-full text-xs ${levelBadge(s.level)}">${s.level}</span></td></tr>`).join("")}</tbody></table>
      </div>
      <div class="grid md:grid-cols-2 gap-4 mb-6">
        <div class="card border-emerald-200"><h3 class="font-semibold text-emerald-700 mb-3">💪 Strengths</h3>
          ${strengths.map((s) => `<p>✓ ${esc(s.skill)} — ${s.score}% (${s.level})</p>`).join("") || "<p class='text-slate-500'>Keep practising!</p>"}</div>
        <div class="card border-red-200"><h3 class="font-semibold text-red-700 mb-3">⚠ Weaknesses</h3>
          ${weak.map((s) => `<p>✗ ${esc(s.skill)} — ${s.score}% (${s.level})</p>`).join("") || "<p class='text-slate-500'>No weak skills 🎉</p>"}</div>
      </div>
      <button onclick="getCareers()" class="${btn}">Get Career Recommendations →</button>`;
  },

  careers() {
    $("view").innerHTML = `
      ${header("🎯 Career Recommendations", "Careers matched to your SkillDNA")}
      <div class="mb-6 flex gap-2"><button onclick="getCareers()" class="${btn}">${me.careers.length ? "Regenerate" : "Generate"} Recommendations</button></div>
      <div class="grid md:grid-cols-2 gap-4">${me.careers.map((c) => `
        <div class="card">
          <div class="flex justify-between items-start"><h3 class="text-lg font-bold">${esc(c.role)}</h3><span class="text-2xl font-extrabold text-indigo-600">${c.readiness}%</span></div>
          <div class="h-2 bg-slate-100 rounded-full my-3"><div class="bar h-2 rounded-full bg-indigo-500" style="width:${c.readiness}%"></div></div>
          <p class="text-sm text-slate-600 mb-3">${esc(c.reason)}</p>
          ${c.avg_salary_india ? `<p class="text-sm mb-2">💰 ${esc(c.avg_salary_india)}</p>` : ""}
          <div class="flex flex-wrap gap-1 mb-2">${(c.matched_skills || []).map((s) => `<span class="text-xs px-2 py-0.5 bg-emerald-100 text-emerald-700 rounded-full">✓ ${esc(s)}</span>`).join("")}</div>
          <div class="flex flex-wrap gap-1 mb-4">${(c.missing_skills || []).map((s) => `<span class="text-xs px-2 py-0.5 bg-red-100 text-red-700 rounded-full">✗ ${esc(s)}</span>`).join("")}</div>
          <button onclick='makeRoadmap(${JSON.stringify(c.role).replace(/'/g, "&#39;")})' class="w-full bg-slate-900 hover:bg-slate-700 text-white py-2 rounded-lg">Select as Target Career →</button>
        </div>`).join("")}</div>`;
  },

  roadmap() {
    const rm = me.roadmap;
    const custom = `
      <div class="card mb-6 flex flex-col md:flex-row gap-2">
        <input id="customCareer" class="${input}" placeholder="Or type any target career, e.g. Data Scientist">
        <button onclick="makeRoadmap($('customCareer').value)" class="${btn} whitespace-nowrap">Build Roadmap</button>
      </div>`;
    if (!rm) { $("view").innerHTML = header("🗺️ Career Roadmap", "Select a target career first") + custom; return; }
    const done = new Set(me.progress);
    const pct = Math.round((done.size / rm.steps.length) * 100);
    const icon = { have: "✅", partial: "⚠️", missing: "❌" };
    $("view").innerHTML = `
      ${header(`🗺️ ${esc(rm.career)} Roadmap`, "Personalized learning path based on your skill gaps")}
      <div class="card mb-6">
        <div class="flex justify-between mb-2"><span class="font-semibold">Roadmap progress</span><span class="font-bold text-indigo-600">${pct}%</span></div>
        <div class="h-3 bg-slate-100 rounded-full"><div class="bar h-3 rounded-full bg-gradient-to-r from-indigo-500 to-emerald-500" style="width:${pct}%"></div></div>
      </div>
      <div class="card mb-6"><h3 class="font-semibold mb-3">Skill Gap Analysis</h3>
        <div class="grid md:grid-cols-2 gap-2">${(rm.gaps || []).map((g) => `
          <div class="flex gap-2 p-2 rounded-lg bg-slate-50"><span>${icon[g.status] || "•"}</span><div><b>${esc(g.skill)}</b><p class="text-xs text-slate-500">${esc(g.note)}</p></div></div>`).join("")}</div>
      </div>
      <div class="relative border-l-4 border-indigo-200 ml-4 space-y-6 mb-6">${rm.steps.map((s, i) => `
        <div class="ml-6 relative">
          <span class="absolute -left-[42px] top-4 w-8 h-8 rounded-full flex items-center justify-center text-white font-bold ${done.has(i) ? "bg-emerald-500" : "bg-indigo-600"}">${done.has(i) ? "✓" : i + 1}</span>
          <div class="card ${done.has(i) ? "opacity-70" : ""}">
            <div class="flex justify-between gap-2 flex-wrap"><h4 class="font-bold text-lg">Step ${i + 1} → ${esc(s.title)}</h4><span class="text-sm text-slate-500">⏱ ${esc(s.duration)}</span></div>
            <p class="text-slate-600 my-2">${esc(s.description)}</p>
            <div class="flex flex-wrap gap-1 mb-2">${(s.topics || []).map((t) => `<span class="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 rounded-full">${esc(t)}</span>`).join("")}</div>
            ${(s.resources || []).length ? `<p class="text-sm">📚 ${s.resources.map(esc).join(" • ")}</p>` : ""}
            ${s.project_idea ? `<p class="text-sm mt-1">🛠 Project: ${esc(s.project_idea)}</p>` : ""}
            <label class="flex items-center gap-2 mt-3 cursor-pointer"><input type="checkbox" ${done.has(i) ? "checked" : ""} onchange="toggleStep(${i}, this.checked)" class="w-4 h-4"> Mark as completed</label>
          </div>
        </div>`).join("")}</div>
      ${custom}`;
  },
};

// ---------- components ----------
const levelOf = (n) => (n >= 80 ? "Strong" : n >= 60 ? "Good" : n >= 40 ? "Developing" : "Weak");
function skillBar(s) {
  return `<div class="mb-3"><div class="flex justify-between text-sm mb-1"><span>${esc(s.skill)}</span><span>${s.score}% · ${s.level}</span></div>
    <div class="h-2.5 bg-slate-100 rounded-full"><div class="bar h-2.5 rounded-full ${levelColor(s.level)}" style="width:${s.score}%"></div></div></div>`;
}
function resumeResult(skills, summary) {
  return `<div class="card"><h3 class="font-semibold mb-2">Extracted from resume</h3>
    ${summary ? `<p class="text-slate-600 mb-3">${esc(summary)}</p>` : ""}
    <div class="flex flex-wrap gap-2">${skills.map((s) => `<span class="px-3 py-1 bg-indigo-100 text-indigo-700 rounded-full text-sm">${esc(s)}</span>`).join("")}</div>
    <button onclick="go('assessment')" class="${btn} mt-4">Take Assessment →</button></div>`;
}
function addProject(p = {}) {
  const div = document.createElement("div");
  div.className = "project grid md:grid-cols-3 gap-2 p-3 bg-slate-50 rounded-lg relative";
  div.innerHTML = `
    <input class="pn ${input}" placeholder="Project name" value="${esc(p.name)}">
    <input class="pt ${input}" placeholder="Technologies (Python, Flask...)" value="${esc(p.tech)}">
    <button onclick="this.parentElement.remove()" class="text-red-500 text-sm md:justify-self-end">Remove</button>
    <textarea class="pd ${input} md:col-span-3" rows="2" placeholder="Description">${esc(p.description)}</textarea>`;
  $("projects").appendChild(div);
}

// ---------- actions ----------
function saveProfile() {
  run(async () => {
    const projects = [...document.querySelectorAll(".project")].map((d) => ({
      name: d.querySelector(".pn").value, tech: d.querySelector(".pt").value, description: d.querySelector(".pd").value,
    }));
    await api("/profile", { method: "POST", body: JSON.stringify({
      name: $("pName").value, education: $("pEdu").value, branch: $("pBranch").value, year: $("pYear").value,
      skills: $("pSkills").value.split(","), projects,
    }) });
    await refresh();
    toast("Profile saved");
    go("resume");
  }, "Saving...");
}
function uploadResume() {
  const f = $("resumeFile").files[0];
  if (!f) return toast("Choose a PDF first", false);
  run(async () => {
    const fd = new FormData();
    fd.append("resume", f);
    const d = await api("/resume", { method: "POST", body: fd });
    await refresh();
    $("resumeOut").innerHTML = resumeResult(d.skills, d.summary);
    toast("Resume analyzed");
  }, "Extracting skills from resume...");
}
function startAssessment() {
  const skills = [...document.querySelectorAll(".skillPick:checked")].map((c) => c.value).slice(0, 5);
  if (!skills.length) return toast("Pick at least one skill", false);
  run(async () => {
    const d = await api("/assessment/start", { method: "POST", body: JSON.stringify({ skills }) });
    currentQuestions = d.questions;
    $("quiz").innerHTML = d.questions.map((q, i) => `
      <div class="card mb-4">
        <p class="text-xs font-semibold text-indigo-600 mb-1">${esc(q.skill)} · Q${i + 1}</p>
        <p class="font-medium mb-3 whitespace-pre-wrap">${esc(q.question)}</p>
        ${q.options.map((o, j) => `<label class="flex gap-2 items-start p-2 rounded-lg hover:bg-slate-50 cursor-pointer has-[:checked]:bg-indigo-50">
          <input type="radio" name="${q.id}" value="${j}" class="mt-1"> <span>${esc(o)}</span></label>`).join("")}
      </div>`).join("") + `<button onclick="submitAssessment()" class="${btn}">Submit Assessment</button>`;
  }, "Generating your personalized assessment...");
}
function submitAssessment() {
  const answers = {};
  currentQuestions.forEach((q) => {
    const c = document.querySelector(`input[name="${q.id}"]:checked`);
    if (c) answers[q.id] = Number(c.value);
  });
  const missing = currentQuestions.length - Object.keys(answers).length;
  if (missing && !confirm(`${missing} question(s) unanswered. Submit anyway?`)) return;
  run(async () => {
    await api("/assessment/submit", { method: "POST", body: JSON.stringify({ answers }) });
    await refresh();
    go("results");
  }, "Analyzing your SkillDNA...");
}
function getCareers() {
  run(async () => {
    await api("/careers", { method: "POST" });
    await refresh();
    go("careers");
  }, "Matching careers to your skills...");
}
function makeRoadmap(career) {
  if (!career || !career.trim()) return toast("Enter a career", false);
  run(async () => {
    await api("/roadmap", { method: "POST", body: JSON.stringify({ career }) });
    await refresh();
    go("roadmap");
  }, "Building your personalized roadmap...");
}
async function toggleStep(i, done) {
  await api("/progress", { method: "POST", body: JSON.stringify({ step: i, done }) }).catch((e) => toast(e.message, false));
  await refresh();
  views.roadmap();
}

// ---------- start ----------
if (token) boot(); else logout();
