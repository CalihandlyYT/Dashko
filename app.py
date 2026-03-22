#!/usr/bin/env python3
"""Сервер входа, регистрации и отзывов для Dashko Studio (без внешних сервисов)."""

import os
import sqlite3
from functools import wraps
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
    _migrate_users_avatar()
    _migrate_users_is_admin()


def _migrate_users_is_admin():
    with get_db() as conn:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        if "is_admin" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0")
            conn.commit()


def _migrate_users_avatar():
    with get_db() as conn:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        if "avatar" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN avatar TEXT")
            conn.commit()


def hash_password(password: str) -> str:
    from werkzeug.security import generate_password_hash
    return generate_password_hash(password, method="pbkdf2:sha256")


def check_password(password: str, password_hash: str) -> bool:
    from werkzeug.security import check_password_hash
    return check_password_hash(password_hash, password)


def admin_email() -> str:
    """Email администратора из переменной окружения ADMIN_EMAIL или DASHKO_ADMIN_EMAIL."""
    return (os.environ.get("ADMIN_EMAIL") or os.environ.get("DASHKO_ADMIN_EMAIL") or "").strip().lower()


def sync_admin_flag(user_id: int, email: str) -> None:
    """Выставить is_admin=1 только для email, совпадающего с ADMIN_EMAIL."""
    want = 1 if admin_email() and email.strip().lower() == admin_email() else 0
    with get_db() as conn:
        conn.execute("UPDATE users SET is_admin = ? WHERE id = ?", (want, user_id))
        conn.commit()


def admin_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        uid = session.get("user_id")
        if not uid:
            return jsonify({"error": "Войдите в аккаунт"}), 401
        with get_db() as conn:
            row = conn.execute(
                "SELECT is_admin FROM users WHERE id = ?", (uid,)
            ).fetchone()
        if not row or not row["is_admin"]:
            return jsonify({"error": "Нет прав администратора"}), 403
        return f(*args, **kwargs)

    return decorated


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
    sync_admin_flag(user_id, email)
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, name, avatar, is_admin FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    session["user_id"] = user_id
    return jsonify({"user": _user_public(row)})


@app.route("/api/login", methods=["POST"])
def api_login():
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Укажите email и пароль"}), 400
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, password_hash, email, name, avatar, is_admin FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if not row or not check_password(password, row["password_hash"]):
        return jsonify({"error": "Неверный email или пароль"}), 401
    session["user_id"] = row["id"]
    sync_admin_flag(row["id"], row["email"])
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, name, avatar, is_admin FROM users WHERE id = ?",
            (session["user_id"],),
        ).fetchone()
    return jsonify({"user": _user_public(row)})


def _user_public(row):
    """Сериализация пользователя для API (без пароля)."""
    d = dict(row)
    return {
        "id": d["id"],
        "email": d["email"],
        "name": d.get("name"),
        "avatar": d.get("avatar") or None,
        "is_admin": bool(d.get("is_admin")),
    }


@app.route("/api/profile", methods=["PATCH"])
def api_profile_patch():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Войдите в аккаунт"}), 401
    data = request.get_json() or {}
    email = (data.get("email") or "").strip().lower()
    avatar = data.get("avatar")
    if avatar is not None and not isinstance(avatar, str):
        return jsonify({"error": "Некорректный аватар"}), 400
    if avatar and len(avatar) > 200000:
        return jsonify({"error": "Аватар слишком большой (макс. ~200 КБ)"}), 400
    new_password = (data.get("new_password") or "").strip()
    current_password = (data.get("current_password") or "")

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, name, password_hash, avatar, is_admin FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            session.pop("user_id", None)
            return jsonify({"error": "Пользователь не найден"}), 404

        updates = []
        params = []

        if "name" in data:
            nm = (data.get("name") or "").strip()
            if nm:
                updates.append("name = ?")
                params.append(nm)

        if email and email != row["email"]:
            try:
                conn.execute("UPDATE users SET email = ? WHERE id = ?", (email, user_id))
                conn.commit()
            except sqlite3.IntegrityError:
                return jsonify({"error": "Этот email уже занят"}), 400

        if "avatar" in data:
            updates.append("avatar = ?")
            params.append(avatar if avatar else None)

        if new_password:
            if len(new_password) < 6:
                return jsonify({"error": "Новый пароль не менее 6 символов"}), 400
            if not check_password(current_password, row["password_hash"]):
                return jsonify({"error": "Неверный текущий пароль"}), 400
            updates.append("password_hash = ?")
            params.append(hash_password(new_password))

        if updates:
            params.append(user_id)
            conn.execute(
                "UPDATE users SET " + ", ".join(updates) + " WHERE id = ?",
                params,
            )
            conn.commit()

        row2 = conn.execute(
            "SELECT id, email, name, avatar, is_admin FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    sync_admin_flag(user_id, row2["email"])
    with get_db() as conn:
        row2 = conn.execute(
            "SELECT id, email, name, avatar, is_admin FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    return jsonify({"user": _user_public(row2)})


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
            "SELECT id, email, name, avatar, is_admin FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if not row:
        session.pop("user_id", None)
        return jsonify({"user": None})
    return jsonify({"user": _user_public(row)})


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
    author_name = (data.get("author_name") or "").strip()
    rating = min(5, max(1, int(data.get("rating") or 5)))
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Напишите текст отзыва"}), 400
    with get_db() as conn:
        if not author_name:
            urow = conn.execute(
                "SELECT name FROM users WHERE id = ?", (session["user_id"],)
            ).fetchone()
            author_name = (urow["name"] or "").strip() or "Гость"
        conn.execute(
            "INSERT INTO reviews (user_id, author_name, rating, text) VALUES (?, ?, ?, ?)",
            (session["user_id"], author_name, rating, text),
        )
        conn.commit()
    return jsonify({"ok": True})


@app.route("/api/admin/stats", methods=["GET"])
@admin_required
def api_admin_stats():
    with get_db() as conn:
        users_n = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        reviews_n = conn.execute("SELECT COUNT(*) FROM reviews").fetchone()[0]
    return jsonify({"users": users_n, "reviews": reviews_n})


@app.route("/api/admin/users", methods=["GET"])
@admin_required
def api_admin_users():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, email, name, is_admin, created_at FROM users ORDER BY id ASC"
        ).fetchall()
    return jsonify({"users": [dict(r) for r in rows]})


@app.route("/api/admin/reviews", methods=["GET"])
@admin_required
def api_admin_reviews():
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT r.id, r.author_name, r.rating, r.text, r.created_at, r.user_id,
                   u.email AS user_email
            FROM reviews r
            LEFT JOIN users u ON u.id = r.user_id
            ORDER BY r.created_at DESC
            """
        ).fetchall()
    return jsonify({"reviews": [dict(r) for r in rows]})


@app.route("/api/admin/reviews/<int:review_id>", methods=["DELETE"])
@admin_required
def api_admin_review_delete(review_id):
    with get_db() as conn:
        cur = conn.execute("DELETE FROM reviews WHERE id = ?", (review_id,))
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "Отзыв не найден"}), 404
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
