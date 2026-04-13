#!/usr/bin/env python3
"""Сервер входа, регистрации и отзывов для Dashko Studio (без внешних сервисов)."""

import csv
import io
import os
import sqlite3
import sys
from datetime import datetime, timedelta, timezone
from functools import wraps
from pathlib import Path

from flask import Flask, request, jsonify, send_from_directory, session, Response

app = Flask(__name__, static_folder=".", static_url_path="")
app.secret_key = os.environ.get("SECRET_KEY", "dashko-dev-secret-change-in-production")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"

DB_PATH = Path(__file__).resolve().parent / "dashko.db"
NEWS_ADMIN_EMAIL = "admin@dashko.ru"


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
            CREATE TABLE IF NOT EXISTS news_posts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                summary TEXT,
                content TEXT NOT NULL,
                author_name TEXT NOT NULL,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP
            );
        """)
    _migrate_users_avatar()
    _migrate_users_is_admin()
    _migrate_users_moderation()
    _migrate_admin_audit()
    _migrate_news_posts()


def _migrate_users_moderation():
    with get_db() as conn:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        if "banned" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN banned INTEGER NOT NULL DEFAULT 0")
            conn.commit()
        cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        if "banned_reason" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN banned_reason TEXT")
            conn.commit()
        cols = {row[1] for row in conn.execute("PRAGMA table_info(users)")}
        if "muted_until" not in cols:
            conn.execute("ALTER TABLE users ADD COLUMN muted_until TEXT")
            conn.commit()


def _migrate_admin_audit():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS admin_audit (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                admin_id INTEGER NOT NULL,
                action TEXT NOT NULL,
                target_user_id INTEGER,
                detail TEXT,
                created_at TEXT DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (admin_id) REFERENCES users(id)
            );
        """)
        conn.commit()


def _migrate_news_posts():
    with get_db() as conn:
        cols = {row[1] for row in conn.execute("PRAGMA table_info(news_posts)")}
        if cols and "summary" not in cols:
            conn.execute("ALTER TABLE news_posts ADD COLUMN summary TEXT")
            conn.commit()


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


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def utc_iso(dt: datetime | None = None) -> str:
    d = dt or utc_now()
    if d.tzinfo is None:
        d = d.replace(tzinfo=timezone.utc)
    return d.strftime("%Y-%m-%dT%H:%M:%SZ")


def muted_still_active(muted_until: str | None) -> bool:
    if not muted_until:
        return False
    try:
        s = muted_until.strip().replace("Z", "+00:00")
        end = datetime.fromisoformat(s)
        if end.tzinfo is None:
            end = end.replace(tzinfo=timezone.utc)
        return end > utc_now()
    except (ValueError, TypeError):
        return False


def log_admin_action(admin_id: int, action: str, target_user_id: int | None = None, detail: str | None = None) -> None:
    try:
        with get_db() as conn:
            conn.execute(
                "INSERT INTO admin_audit (admin_id, action, target_user_id, detail) VALUES (?, ?, ?, ?)",
                (admin_id, action, target_user_id, detail),
            )
            conn.commit()
    except Exception:
        pass


def _user_public(row):
    """Сериализация пользователя для API (без пароля)."""
    d = dict(row)
    mu = d.get("muted_until")
    return {
        "id": d["id"],
        "email": d["email"],
        "name": d.get("name"),
        "avatar": d.get("avatar") or None,
        "is_admin": bool(d.get("is_admin")),
        "muted_until": mu if muted_still_active(mu) else None,
        "is_muted": muted_still_active(mu),
    }


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


def _fetch_user_row(conn, user_id: int):
    return conn.execute(
        """SELECT id, email, name, avatar, is_admin, banned, muted_until
           FROM users WHERE id = ?""",
        (user_id,),
    ).fetchone()


def authenticate_admin_credentials(email: str, password: str):
    email = (email or "").strip().lower()
    password = password or ""
    if not email or not password:
        return None, "Укажите логин и пароль"

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, name, password_hash, is_admin, banned FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if not row or not check_password(password, row["password_hash"]):
        return None, "Неверный логин или пароль"
    sync_admin_flag(row["id"], row["email"])
    with get_db() as conn:
        refreshed = conn.execute(
            "SELECT id, email, name, is_admin, banned FROM users WHERE id = ?",
            (row["id"],),
        ).fetchone()
    if not refreshed:
        return None, "Пользователь не найден"
    if refreshed["banned"]:
        return None, "Аккаунт заблокирован"
    if refreshed["email"].strip().lower() != NEWS_ADMIN_EMAIL:
        return None, "Публиковать новости может только аккаунт admin@dashko.ru"
    if not refreshed["is_admin"]:
        return None, "Публиковать новости может только администратор"
    return refreshed, None


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
            "SELECT id, password_hash, email, name, avatar, is_admin, banned, banned_reason, muted_until FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if not row or not check_password(password, row["password_hash"]):
        return jsonify({"error": "Неверный email или пароль"}), 401
    if row["banned"]:
        return jsonify(
            {
                "error": "Аккаунт заблокирован"
                + (f": {row['banned_reason']}" if row["banned_reason"] else ""),
                "banned": True,
            }
        ), 403
    session["user_id"] = row["id"]
    sync_admin_flag(row["id"], row["email"])
    with get_db() as conn:
        row = _fetch_user_row(conn, session["user_id"])
    return jsonify({"user": _user_public(row)})


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
            "SELECT id, email, name, password_hash, avatar, is_admin, banned, muted_until FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not row:
            session.pop("user_id", None)
            return jsonify({"error": "Пользователь не найден"}), 404
        if row["banned"]:
            session.pop("user_id", None)
            return jsonify({"error": "Аккаунт заблокирован", "banned": True}), 403

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

        row2 = _fetch_user_row(conn, user_id)
    sync_admin_flag(user_id, row2["email"])
    with get_db() as conn:
        row2 = _fetch_user_row(conn, user_id)
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
            "SELECT id, email, name, avatar, is_admin, banned, muted_until FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
    if not row:
        session.pop("user_id", None)
        return jsonify({"user": None})
    if row["banned"]:
        session.pop("user_id", None)
        return jsonify({"user": None, "banned": True})
    return jsonify({"user": _user_public(row)})


@app.route("/api/reviews", methods=["GET"])
def api_reviews_list():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, author_name, rating, text, created_at FROM reviews ORDER BY created_at DESC"
        ).fetchall()
    return jsonify({"reviews": [dict(r) for r in rows]})


@app.route("/api/news", methods=["GET"])
def api_news_list():
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, title, summary, content, author_name, created_at
            FROM news_posts
            ORDER BY datetime(created_at) DESC, id DESC
            """
        ).fetchall()
    return jsonify({"news": [dict(r) for r in rows]})


@app.route("/api/news", methods=["POST"])
def api_news_create():
    user_id = session.get("user_id")
    if not user_id:
        return jsonify({"error": "Для публикации новости войдите в аккаунт admin@dashko.ru"}), 401

    with get_db() as conn:
        admin_row = conn.execute(
            "SELECT id, email, name, is_admin, banned FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

    if not admin_row:
        session.pop("user_id", None)
        return jsonify({"error": "Пользователь не найден"}), 401
    if admin_row["banned"]:
        session.pop("user_id", None)
        return jsonify({"error": "Аккаунт заблокирован"}), 403

    sync_admin_flag(admin_row["id"], admin_row["email"])
    with get_db() as conn:
        admin_row = conn.execute(
            "SELECT id, email, name, is_admin, banned FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()

    if admin_row["email"].strip().lower() != NEWS_ADMIN_EMAIL:
        return jsonify({"error": "Публиковать новости может только аккаунт admin@dashko.ru"}), 403
    if not admin_row["is_admin"]:
        return jsonify({"error": "Аккаунт admin@dashko.ru должен быть назначен администратором"}), 403

    data = request.get_json() or {}
    title = (data.get("title") or "").strip()
    summary = (data.get("summary") or "").strip()
    content = (data.get("content") or "").strip()

    if not title:
        return jsonify({"error": "Укажите заголовок новости"}), 400
    if not content:
        return jsonify({"error": "Напишите текст новости"}), 400

    author_name = (admin_row["name"] or admin_row["email"] or "Администратор").strip()
    with get_db() as conn:
        cur = conn.execute(
            """
            INSERT INTO news_posts (title, summary, content, author_name)
            VALUES (?, ?, ?, ?)
            """,
            (title, summary or None, content, author_name),
        )
        conn.commit()
        news_id = cur.lastrowid
    log_admin_action(admin_row["id"], "news_create", None, f"news_id={news_id}; title={title}")
    return jsonify({"ok": True, "id": news_id})


@app.route("/api/reviews", methods=["POST"])
def api_reviews_create():
    uid = session.get("user_id")
    if not uid:
        return jsonify({"error": "Войдите в аккаунт"}), 401
    with get_db() as conn:
        urow = conn.execute(
            "SELECT banned, muted_until FROM users WHERE id = ?", (uid,)
        ).fetchone()
    if not urow:
        session.pop("user_id", None)
        return jsonify({"error": "Пользователь не найден"}), 401
    if urow["banned"]:
        session.pop("user_id", None)
        return jsonify({"error": "Аккаунт заблокирован", "banned": True}), 403
    if muted_still_active(urow["muted_until"]):
        return jsonify(
            {
                "error": "Вам временно запрещено оставлять отзывы (мут). Попробуйте позже.",
                "muted": True,
                "muted_until": urow["muted_until"],
            }
        ), 403
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
        banned_n = conn.execute("SELECT COUNT(*) FROM users WHERE banned = 1").fetchone()[0]
        admins_n = conn.execute("SELECT COUNT(*) FROM users WHERE is_admin = 1").fetchone()[0]
        row_avg = conn.execute("SELECT AVG(rating) FROM reviews").fetchone()[0]
        avg_rating = round(float(row_avg), 2) if row_avg is not None else 0
        reg_7 = conn.execute(
            """SELECT COUNT(*) FROM users
               WHERE datetime(created_at) >= datetime('now', '-7 days')"""
        ).fetchone()[0]
        rev_7 = conn.execute(
            """SELECT COUNT(*) FROM reviews
               WHERE datetime(created_at) >= datetime('now', '-7 days')"""
        ).fetchone()[0]
        mu_rows = conn.execute(
            "SELECT muted_until FROM users WHERE muted_until IS NOT NULL"
        ).fetchall()
    muted_active = sum(1 for r in mu_rows if muted_still_active(r["muted_until"]))
    db_bytes = DB_PATH.stat().st_size if DB_PATH.exists() else 0
    return jsonify(
        {
            "users": users_n,
            "reviews": reviews_n,
            "banned": banned_n,
            "admins": admins_n,
            "muted_active": muted_active,
            "avg_rating": avg_rating,
            "registered_last_7_days": reg_7,
            "reviews_last_7_days": rev_7,
            "db_size_bytes": db_bytes,
            "python_version": sys.version.split()[0],
        }
    )


@app.route("/api/admin/server-info", methods=["GET"])
@admin_required
def api_admin_server_info():
    return jsonify(
        {
            "python": sys.version,
            "db_path": str(DB_PATH.resolve()),
            "db_size_bytes": DB_PATH.stat().st_size if DB_PATH.exists() else 0,
            "admin_email_configured": bool(admin_email()),
        }
    )


@app.route("/api/admin/users", methods=["GET"])
@admin_required
def api_admin_users():
    q = (request.args.get("q") or "").strip().lower()
    with get_db() as conn:
        if q:
            like = f"%{q}%"
            rows = conn.execute(
                """
                SELECT id, email, name, is_admin, created_at, banned, banned_reason, muted_until
                FROM users
                WHERE lower(email) LIKE ? OR lower(COALESCE(name, '')) LIKE ?
                ORDER BY id ASC
                """,
                (like, like),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT id, email, name, is_admin, created_at, banned, banned_reason, muted_until
                FROM users ORDER BY id ASC
                """
            ).fetchall()
    out = []
    for r in rows:
        d = dict(r)
        d["is_admin"] = bool(d["is_admin"])
        d["banned"] = bool(d["banned"])
        d["muted_active"] = muted_still_active(d.get("muted_until"))
        out.append(d)
    return jsonify({"users": out})


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
    admin_id = session.get("user_id")
    with get_db() as conn:
        cur = conn.execute("DELETE FROM reviews WHERE id = ?", (review_id,))
        conn.commit()
        if cur.rowcount == 0:
            return jsonify({"error": "Отзыв не найден"}), 404
    log_admin_action(admin_id, "review_delete", None, f"review_id={review_id}")
    return jsonify({"ok": True})


@app.route("/api/admin/users/<int:user_id>", methods=["PATCH", "DELETE"])
@admin_required
def api_admin_user(user_id):
    admin_id = session.get("user_id")
    if user_id == admin_id:
        return jsonify({"error": "Нельзя применить к своей учётной записи"}), 400

    with get_db() as conn:
        target = conn.execute(
            "SELECT id, email, is_admin, banned, muted_until FROM users WHERE id = ?",
            (user_id,),
        ).fetchone()
        if not target:
            return jsonify({"error": "Пользователь не найден"}), 404
        if target["is_admin"]:
            return jsonify({"error": "Нельзя модерировать другого администратора"}), 403

    if request.method == "DELETE":
        with get_db() as conn:
            conn.execute("DELETE FROM reviews WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
            conn.commit()
        log_admin_action(admin_id, "user_delete", user_id, target["email"])
        return jsonify({"ok": True})

    data = request.get_json() or {}

    if data.get("unban"):
        with get_db() as conn:
            conn.execute(
                "UPDATE users SET banned = 0, banned_reason = NULL WHERE id = ?",
                (user_id,),
            )
            conn.commit()
        log_admin_action(admin_id, "user_unban", user_id, None)
        return jsonify({"ok": True})

    if data.get("unmute"):
        with get_db() as conn:
            conn.execute("UPDATE users SET muted_until = NULL WHERE id = ?", (user_id,))
            conn.commit()
        log_admin_action(admin_id, "user_unmute", user_id, None)
        return jsonify({"ok": True})

    if data.get("banned") is True:
        reason = (data.get("banned_reason") or "").strip() or None
        with get_db() as conn:
            conn.execute(
                "UPDATE users SET banned = 1, banned_reason = ? WHERE id = ?",
                (reason, user_id),
            )
            conn.commit()
        log_admin_action(admin_id, "user_ban", user_id, reason or "")
        return jsonify({"ok": True})

    mute_minutes = data.get("mute_minutes")
    if mute_minutes is not None:
        try:
            m = int(mute_minutes)
        except (TypeError, ValueError):
            return jsonify({"error": "mute_minutes должно быть числом"}), 400
        if m <= 0 or m > 525600:  # max 1 year
            return jsonify({"error": "Введите длительность мута от 1 до 525600 минут (год)"}), 400
        until = utc_iso(utc_now() + timedelta(minutes=m))
        with get_db() as conn:
            conn.execute(
                "UPDATE users SET muted_until = ? WHERE id = ?",
                (until, user_id),
            )
            conn.commit()
        log_admin_action(admin_id, "user_mute", user_id, f"{m} min until {until}")
        return jsonify({"ok": True, "muted_until": until})

    return jsonify({"error": "Укажите banned, mute_minutes, unban или unmute"}), 400


@app.route("/api/admin/audit", methods=["GET"])
@admin_required
def api_admin_audit():
    limit = min(200, max(10, int(request.args.get("limit", 50))))
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT a.id, a.admin_id, u.email AS admin_email, a.action, a.target_user_id,
                   a.detail, a.created_at
            FROM admin_audit a
            LEFT JOIN users u ON u.id = a.admin_id
            ORDER BY a.id DESC
            LIMIT ?
            """,
            (limit,),
        ).fetchall()
    return jsonify({"entries": [dict(r) for r in rows]})


@app.route("/api/admin/export/users.csv", methods=["GET"])
@admin_required
def api_admin_export_users_csv():
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT id, email, name, is_admin, banned, banned_reason, muted_until, created_at
            FROM users ORDER BY id
            """
        ).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(
        ["id", "email", "name", "is_admin", "banned", "banned_reason", "muted_until", "created_at"]
    )
    for r in rows:
        d = dict(r)
        w.writerow(
            [
                d["id"],
                d["email"],
                d.get("name") or "",
                d["is_admin"],
                d["banned"],
                d.get("banned_reason") or "",
                d.get("muted_until") or "",
                d.get("created_at") or "",
            ]
        )
    out = buf.getvalue()
    return Response(
        out.encode("utf-8-sig"),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="dashko_users.csv"'},
    )


@app.route("/api/admin/export/reviews.csv", methods=["GET"])
@admin_required
def api_admin_export_reviews_csv():
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT r.id, r.user_id, r.author_name, r.rating, r.text, r.created_at, u.email
            FROM reviews r
            LEFT JOIN users u ON u.id = r.user_id
            ORDER BY r.id
            """
        ).fetchall()
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["id", "user_id", "author_name", "rating", "text", "created_at", "user_email"])
    for r in rows:
        d = dict(r)
        w.writerow(
            [
                d["id"],
                d["user_id"],
                d["author_name"],
                d["rating"],
                (d["text"] or "").replace("\r\n", " ").replace("\n", " "),
                d.get("created_at") or "",
                d.get("email") or "",
            ]
        )
    out = buf.getvalue()
    return Response(
        out.encode("utf-8-sig"),
        mimetype="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="dashko_reviews.csv"'},
    )


@app.route("/api/admin/reviews/bulk-delete", methods=["POST"])
@admin_required
def api_admin_reviews_bulk_delete():
    admin_id = session.get("user_id")
    data = request.get_json() or {}
    ids = data.get("ids")
    if not isinstance(ids, list) or not ids:
        return jsonify({"error": "Передайте ids: [1, 2, 3]"}), 400
    try:
        int_ids = [int(x) for x in ids]
    except (TypeError, ValueError):
        return jsonify({"error": "Некорректные id"}), 400
    if len(int_ids) > 500:
        return jsonify({"error": "Максимум 500 за раз"}), 400
    placeholders = ",".join("?" * len(int_ids))
    with get_db() as conn:
        cur = conn.execute(f"DELETE FROM reviews WHERE id IN ({placeholders})", int_ids)
        conn.commit()
        n = cur.rowcount
    log_admin_action(admin_id, "reviews_bulk_delete", None, f"count={n}")
    return jsonify({"ok": True, "deleted": n})


@app.route("/api/admin/reviews/clear-all", methods=["POST"])
@admin_required
def api_admin_reviews_clear_all():
    admin_id = session.get("user_id")
    data = request.get_json() or {}
    if data.get("confirm") != "DELETE_ALL_REVIEWS":
        return jsonify({"error": 'В теле запроса укажите {"confirm": "DELETE_ALL_REVIEWS"}'}), 400
    with get_db() as conn:
        row = conn.execute("SELECT COUNT(*) FROM reviews").fetchone()
        n = row[0]
        conn.execute("DELETE FROM reviews")
        conn.commit()
    log_admin_action(admin_id, "reviews_clear_all", None, f"deleted={n}")
    return jsonify({"ok": True, "deleted": n})


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
