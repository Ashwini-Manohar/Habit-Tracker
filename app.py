import sqlite3
from datetime import date
from flask import Flask, request, jsonify, render_template, g

app = Flask(__name__)
DB_PATH = "habits.db"


def get_db():
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(exception=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS habits (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            created_at TEXT NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            habit_id INTEGER NOT NULL,
            date TEXT NOT NULL,
            UNIQUE(habit_id, date),
            FOREIGN KEY (habit_id) REFERENCES habits(id) ON DELETE CASCADE
        )
        """
    )
    conn.commit()
    conn.close()


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/habits", methods=["GET"])
def list_habits():
    db = get_db()
    habits = db.execute("SELECT id, name FROM habits ORDER BY id ASC").fetchall()
    result = []
    for h in habits:
        dates = db.execute(
            "SELECT date FROM logs WHERE habit_id = ? ORDER BY date ASC", (h["id"],)
        ).fetchall()
        result.append({
            "id": h["id"],
            "name": h["name"],
            "dates": [d["date"] for d in dates],
        })
    return jsonify(result)


@app.route("/api/habits", methods=["POST"])
def create_habit():
    data = request.get_json(force=True)
    name = (data.get("name") or "").strip()[:40]
    if not name:
        return jsonify({"error": "name is required"}), 400

    db = get_db()
    cur = db.execute(
        "INSERT INTO habits (name, created_at) VALUES (?, ?)",
        (name, date.today().isoformat()),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid, "name": name, "dates": []}), 201


@app.route("/api/habits/<int:habit_id>", methods=["DELETE"])
def delete_habit(habit_id):
    db = get_db()
    db.execute("DELETE FROM habits WHERE id = ?", (habit_id,))
    db.commit()
    return jsonify({"status": "deleted"})


@app.route("/api/habits/<int:habit_id>/toggle", methods=["POST"])
def toggle_log(habit_id):
    data = request.get_json(force=True) or {}
    log_date = data.get("date") or date.today().isoformat()

    db = get_db()
    existing = db.execute(
        "SELECT id FROM logs WHERE habit_id = ? AND date = ?", (habit_id, log_date)
    ).fetchone()

    if existing:
        db.execute("DELETE FROM logs WHERE id = ?", (existing["id"],))
        done = False
    else:
        db.execute(
            "INSERT INTO logs (habit_id, date) VALUES (?, ?)", (habit_id, log_date)
        )
        done = True

    db.commit()
    return jsonify({"date": log_date, "done": done})


init_db()  # ensures tables exist whether run via `python app.py` or gunicorn

if __name__ == "__main__":
    app.run(debug=True, port=5000)
