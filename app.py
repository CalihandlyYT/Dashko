#!/usr/bin/env python3
"""Сервер входа, регистрации и отзывов для Dashko Studio (без внешних сервисов)."""

import os
import sqlite3
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory, session

app = Flask(__name__, static_folder=".", static_url_path="")
app.secret_key = os.environ.get("SECRET_KEY", "dashko-dev-secret-change-in-production")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

DB_PATH = Path(__file__).resolve().parent / "dashko.db"


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT UNIQUE NOT NULL,
                password_hash TEXT NOT NULL,
                name TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
            CREATE TABLE IF NOT EXISTS reviews (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER,
                author_name TEXT NOT NULL,
                rating INTEGER NOT NULL CHECK(rating >= 1 AND rating <= 5),
                text TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (user_id) REFERENCES users(id)
            );
        """)


def hash_password(password: str) -> str:
    from werkzeug.security import generate_password_hash
    return generate_password_hash(password, method="pbkdf2:sha256")


def check_password(password: str, password_hash: str) -> bool:
    from werkzeug.security import check_password_hash
    return check_password_hash(password_hash, password)


# --- API ---

@app.route("/api/register", methods=["POST"])
def api_register():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip() or email
    if not email or not password:
        return jsonify({"error": "Укажите email и пароль"}), 400
    if len(password) < 6:
        return jsonify({"error": "Пароль не менее 6 символов"}), 400
    try:
        with get_db() as conn:
            cur = conn.execute(
                "INSERT INTO users (email, password_hash, name) VALUES (?, ?, ?)",
                (email, hash_password(password), name),
            )
            conn.commit()
            user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        return jsonify({"error": "Такой email уже зарегистрирован"}), 400
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, name FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    session["user_id"] = user_id
    return jsonify({"user": {"id": row["id"], "email": row["email"], "name": row["name"]}})


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Укажите email и пароль"}), 400
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, password_hash, email, name FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if not row or not check_password(password, row["password_hash"]):
        return jsonify({"error": "Неверный email или пароль"}), 401
    session["user_id"] = row["id"]
    return jsonify({"user": {"id": row["id"], "email": row["email"], "name": row["name"]}})


@app.route("/api/logout", methods=["POST"])
def api_logout():
    session.pop("user_id", None)
    return jsonify({"ok": True})


@app.route("/api/me", methods=["GET"])
def api_me():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"user": None})
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, name FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if not row:
        session.pop("user_id", None)
        return jsonify({"user": None})
    return jsonify({"user": {"id": row["id"], "email": row["email"], "name": row["name"]}})


@app.route("/api/reviews", methods=["GET"])
def api_reviews_list():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, author_name, rating, text, created_at FROM reviews ORDER BY created_at DESC"
        ).fetchall()
    return jsonify({"reviews": [dict(r) for r in rows]})


@app.route("/api/reviews", methods=["POST"])
def api_reviews_create():
    if not session.get("user_id"):
        return jsonify({"error": "Войдите в аккаунт"}), 401
    data = request.get_json() or {}
    author_name = (data.get("author_name") or "").strip() or "Гость"
    rating = min(5, max(1, int(data.get("rating") or 5)))
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Напишите текст отзыва"}), 400
    with get_db() as conn:
        conn.execute(
            "INSERT INTO reviews (user_id, author_name, rating, text) VALUES (?, ?, ?, ?)",
            (session["user_id"], author_name, rating, text),
        )
        conn.commit()
    return jsonify({"ok": True})


# --- Статика ---

@app.route("/")
def index():
    return send_from_directory(".", "index.html")


@app.route("/<path:path>")
def static_file(path):
    if path.startswith("api/"):
        return None
    # Не отдавать служебные файлы
    if path in ("app.py", "main.py", "requirements.txt") or path.endswith(".db"):
        return None
    return send_from_directory(".", path)


if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 8000))
    app.run(host="127.0.0.1", port=port, debug=True)
