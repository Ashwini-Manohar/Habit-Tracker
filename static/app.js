const today = stripTime(new Date());
const DAYS = 70;
let habits = []; // [{id, name, logs: Set}]
let currentView = "heatmap";

function stripTime(d) { const x = new Date(d); x.setHours(0,0,0,0); return x; }
function isoDate(d) { return d.toISOString().slice(0,10); }
function addDays(d, n) { const x = new Date(d); x.setDate(x.getDate() + n); return x; }

async function loadHabits() {
  const res = await fetch("/api/habits");
  const data = await res.json();
  habits = data.map(h => ({ id: h.id, name: h.name, logs: new Set(h.dates) }));
  render();
}

function currentStreak(logs) {
  let streak = 0;
  let cursor = new Date(today);
  if (!logs.has(isoDate(cursor))) cursor = addDays(cursor, -1);
  while (logs.has(isoDate(cursor))) { streak++; cursor = addDays(cursor, -1); }
  return streak;
}

function longestStreak(logs) {
  const dates = Array.from(logs).sort();
  let longest = 0, run = 0, prev = null;
  for (const d of dates) {
    run = (prev && (new Date(d) - new Date(prev)) === 86400000) ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = d;
  }
  return longest;
}

function weeklyPercent(logs) {
  let count = 0;
  for (let i = 0; i < 7; i++) if (logs.has(isoDate(addDays(today, -i)))) count++;
  return Math.round((count / 7) * 100);
}

function milestoneBadge(streak) {
  if (streak >= 30) return "🏆 30-day streak";
  if (streak >= 7) return "🔥 7-day streak";
  return null;
}

function levelFor(dateStr, logs) {
  if (new Date(dateStr) > today) return "future";
  return logs.has(dateStr) ? "3" : "0";
}

function renderCalendar(habit) {
  const container = document.createElement("div");
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const label = document.createElement("div");
  label.className = "cal-month-label";
  label.textContent = monthStart.toLocaleString(undefined, { month: "long", year: "numeric" });
  container.appendChild(label);

  const grid = document.createElement("div");
  grid.className = "calendar";
  ["S","M","T","W","T","F","S"].forEach(d => {
    const lab = document.createElement("div");
    lab.className = "cal-label";
    lab.textContent = d;
    grid.appendChild(lab);
  });

  for (let i = 0; i < monthStart.getDay(); i++) {
    const pad = document.createElement("div");
    pad.className = "cal-cell";
    pad.setAttribute("data-level", "pad");
    grid.appendChild(pad);
  }

  const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  for (let day = 1; day <= daysInMonth; day++) {
    const d = new Date(today.getFullYear(), today.getMonth(), day);
    const dstr = isoDate(d);
    const cell = document.createElement("button");
    cell.className = "cal-cell";
    const lvl = levelFor(dstr, habit.logs);
    cell.setAttribute("data-level", lvl);
    cell.textContent = day;
    if (dstr === isoDate(today)) cell.classList.add("is-today");
    if (lvl !== "future") cell.onclick = () => toggle(habit, dstr);
    grid.appendChild(cell);
  }
  container.appendChild(grid);
  return container;
}

function renderSummary() {
  const el = document.getElementById("summary");
  if (habits.length === 0) { el.innerHTML = ""; return; }
  const bestStreak = Math.max(...habits.map(h => currentStreak(h.logs)), 0);
  const avgWeek = Math.round(habits.reduce((s, h) => s + weeklyPercent(h.logs), 0) / habits.length);
  el.innerHTML = `
    <div class="summary-item"><div class="num">${habits.length}</div><div class="label">Habits tracked</div></div>
    <div class="summary-item"><div class="num">${bestStreak}</div><div class="label">Best active streak</div></div>
    <div class="summary-item"><div class="num">${avgWeek}%</div><div class="label">Avg. completion this week</div></div>
  `;
}

function render() {
  const list = document.getElementById("habit-list");
  const empty = document.getElementById("empty-state");
  list.innerHTML = "";
  renderSummary();

  if (habits.length === 0) { empty.style.display = "block"; return; }
  empty.style.display = "none";

  habits.forEach(habit => {
    const card = document.createElement("div");
    card.className = "habit-card";
    const streak = currentStreak(habit.logs);
    const longest = longestStreak(habit.logs);
    const doneToday = habit.logs.has(isoDate(today));

    const top = document.createElement("div");
    top.className = "habit-top";
    top.innerHTML = `
      <div>
        <p class="habit-name">${escapeHtml(habit.name)}</p>
        <div class="habit-stats">
          <span><b>${streak}</b> day streak</span>
          <span>Best: <b>${longest}</b></span>
          <span>This week: <b>${weeklyPercent(habit.logs)}%</b></span>
        </div>
      </div>`;
    const badgeText = milestoneBadge(streak);
    if (badgeText) {
      const badge = document.createElement("span");
      badge.className = "badge";
      badge.textContent = badgeText;
      top.querySelector("div").appendChild(document.createElement("br"));
      top.querySelector("div").appendChild(badge);
    }
    const btn = document.createElement("button");
    btn.className = "today-btn" + (doneToday ? " done" : "");
    btn.textContent = doneToday ? "Done today ✓" : "Mark today";
    btn.onclick = () => toggle(habit, isoDate(today));
    top.appendChild(btn);
    card.appendChild(top);

    const container = document.createElement("div");
    if (currentView === "calendar") {
      container.appendChild(renderCalendar(habit));
    } else {
      container.className = "heatmap";
      for (let i = DAYS - 1; i >= -6; i--) {
        const dstr = isoDate(addDays(today, -i));
        const cell = document.createElement("button");
        cell.className = "cell";
        const lvl = levelFor(dstr, habit.logs);
        cell.setAttribute("data-level", lvl);
        cell.title = dstr;
        if (lvl !== "future") cell.onclick = () => toggle(habit, dstr);
        container.appendChild(cell);
      }
    }
    card.appendChild(container);

    const foot = document.createElement("div");
    foot.className = "heatmap-foot";
    foot.innerHTML = `<span>${DAYS} days</span>`;
    const removeBtn = document.createElement("button");
    removeBtn.className = "remove-btn";
    removeBtn.textContent = "Remove habit";
    removeBtn.onclick = () => removeHabit(habit.id);
    foot.appendChild(removeBtn);
    card.appendChild(foot);

    list.appendChild(card);
  });
}

function escapeHtml(str) {
  const d = document.createElement("div");
  d.textContent = str;
  return d.innerHTML;
}

async function toggle(habit, dateStr) {
  const res = await fetch(`/api/habits/${habit.id}/toggle`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ date: dateStr }),
  });
  const result = await res.json();
  if (result.done) habit.logs.add(dateStr);
  else habit.logs.delete(dateStr);
  render();
}

async function addHabit() {
  const input = document.getElementById("new-habit");
  const name = input.value.trim();
  if (!name) return;
  const res = await fetch("/api/habits", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const habit = await res.json();
  habits.push({ id: habit.id, name: habit.name, logs: new Set() });
  input.value = "";
  render();
}

async function removeHabit(id) {
  await fetch(`/api/habits/${id}`, { method: "DELETE" });
  habits = habits.filter(h => h.id !== id);
  render();
}

document.getElementById("add-btn").onclick = addHabit;
document.getElementById("new-habit").addEventListener("keydown", e => {
  if (e.key === "Enter") addHabit();
});
document.getElementById("btn-heatmap").onclick = () => setView("heatmap");
document.getElementById("btn-calendar").onclick = () => setView("calendar");
function setView(view) {
  currentView = view;
  document.getElementById("btn-heatmap").classList.toggle("active", view === "heatmap");
  document.getElementById("btn-calendar").classList.toggle("active", view === "calendar");
  render();
}

loadHabits();
