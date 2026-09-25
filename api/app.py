#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
تایپ‌هاب | TypeHub — بک‌اند
Flask + SQLite — احراز هویت (تأیید ثبت‌نام توسط ادمین)، همگام‌سازی پیشرفت یادگیری، پنل ادمین.

اجرا (توسعه):  TYPEHUB_DATA_DIR=./data python3 app.py
اجرا (سرور):   gunicorn app:app --bind 127.0.0.1:8000   (با TYPEHUB_DATA_DIR=/opt/typehub/data)
"""

import json
import os
import re
import sqlite3
from datetime import datetime, timedelta, timezone
from functools import wraps

from flask import Flask, request, jsonify, session, g
from werkzeug.security import generate_password_hash, check_password_hash

BASE_DIR = os.path.dirname(os.path.abspath(__file__))


def resolve_data_dir():
    env = os.environ.get("TYPEHUB_DATA_DIR")
    if env:
        return env
    if os.path.isdir("/opt/typehub/data"):
        return "/opt/typehub/data"
    return os.path.join(BASE_DIR, "data")


DATA_DIR = resolve_data_dir()
DB_PATH = os.path.join(DATA_DIR, "typehub.db")
SECRET_PATH = os.path.join(DATA_DIR, "secret.key")

app = Flask(__name__)


def load_secret():
    os.makedirs(DATA_DIR, exist_ok=True)
    if not os.path.exists(SECRET_PATH):
        with open(SECRET_PATH, "w") as f:
            f.write(os.urandom(32).hex())
        os.chmod(SECRET_PATH, 0o600)
    with open(SECRET_PATH, "r") as f:
        return f.read().strip()


app.secret_key = load_secret()
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    PERMANENT_SESSION_LIFETIME=timedelta(days=30),
)

EMAIL_RE = re.compile(r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$")

STATUS_LABELS = {
    "pending": "در انتظار تأیید",
    "active": "فعال",
    "rejected": "رد شده",
    "disabled": "غیرفعال",
}

EMPTY_PROGRESS = {
    "xp": 0, "streak": 0, "lastDay": None, "done": 0,
    "correctWords": 0, "totalWords": 0, "accSum": 0, "wpmSum": 0,
    "levelDone": {}, "mistakes": [],
}


# ---------------------------------------------------------------- دیتابیس
def get_db():
    if "db" not in g:
        db = sqlite3.connect(DB_PATH)
        db.row_factory = sqlite3.Row
        g.db = db
    return g.db


@app.teardown_appcontext
def close_db(_exc=None):
    db = g.pop("db", None)
    if db is not None:
        db.close()


def init_db():
    """ساخت جداول (idempotent) + تنظیمات پیش‌فرض."""
    os.makedirs(DATA_DIR, exist_ok=True)
    db = sqlite3.connect(DB_PATH)
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS users (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            name          TEXT NOT NULL,
            email         TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL,
            role          TEXT NOT NULL DEFAULT 'user',
            status        TEXT NOT NULL DEFAULT 'pending',
            created_at    TEXT NOT NULL,
            last_login    TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_users_email  ON users(email);
        CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS progress (
            user_id    INTEGER PRIMARY KEY,
            data       TEXT NOT NULL DEFAULT '{}',
            updated_at TEXT NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        );
        """
    )
    db.commit()
    defaults = {
        "site_name": "تایپ‌هاب | TypeHub",
        "announcement": "",
        "max_plays": "3",
    }
    for k, v in defaults.items():
        db.execute("INSERT OR IGNORE INTO settings(key, value) VALUES (?, ?)", (k, v))
    db.commit()
    db.close()


def now_iso():
    return datetime.now(timezone.utc).isoformat()


def user_to_dict(row):
    return {
        "id": row["id"],
        "name": row["name"],
        "email": row["email"],
        "role": row["role"],
        "status": row["status"],
        "status_label": STATUS_LABELS.get(row["status"], row["status"]),
        "created_at": row["created_at"],
        "last_login": row["last_login"],
    }


def get_user_by_id(uid):
    row = get_db().execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    return user_to_dict(row) if row else None


def get_user_by_email(email):
    return (
        get_db()
        .execute("SELECT * FROM users WHERE email = ?", (email.strip().lower(),))
        .fetchone()
    )


# ---------------------------------------------------------------- کمک‌ها
def ok(**data):
    payload = {"ok": True}
    payload.update(data)
    return jsonify(payload)


def err(message, code="error", http=400):
    return jsonify({"ok": False, "error": code, "message": message}), http


def login_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        uid = session.get("uid")
        if not uid:
            return err("وارد نشده‌اید. لطفاً ابتدا وارد شوید.", "unauthorized", 401)
        me = get_user_by_id(uid)
        if not me or me["status"] != "active":
            session.clear()
            return err("نشست شما معتبر نیست.", "unauthorized", 401)
        g.me = me
        return fn(*a, **kw)

    return wrapper


def admin_required(fn):
    @wraps(fn)
    def wrapper(*a, **kw):
        uid = session.get("uid")
        if not uid:
            return err("وارد نشده‌اید.", "unauthorized", 401)
        me = get_user_by_id(uid)
        if not me or me["status"] != "active" or me["role"] != "admin":
            return err("دسترسی مدیر لازم است.", "forbidden", 403)
        g.me = me
        return fn(*a, **kw)

    return wrapper


# ---------------------------------------------------------------- عمومی
@app.get("/api/public/site")
def public_site():
    db = get_db()
    rows = db.execute("SELECT key, value FROM settings").fetchall()
    return ok(site={r["key"]: r["value"] for r in rows})


# ---------------------------------------------------------------- احراز هویت
@app.post("/api/auth/signup")
def signup():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if not name:
        return err("نام را وارد کنید.", "validation")
    if not EMAIL_RE.match(email):
        return err("نشانی ایمیل معتبر نیست.", "validation")
    if len(password) < 8:
        return err("گذرواژه باید حداقل ۸ کاراکتر باشد.", "validation")

    db = get_db()
    if db.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
        return err("این ایمیل قبلاً ثبت شده است؛ وارد شوید.", "duplicate", 409)

    db.execute(
        "INSERT INTO users(name, email, password_hash, role, status, created_at)"
        " VALUES (?, ?, ?, 'user', 'pending', ?)",
        (name, email, generate_password_hash(password), now_iso()),
    )
    db.commit()
    return ok(message="ثبت‌نام انجام شد؛ حساب شما پس از تأیید مدیر فعال می‌شود."), 201


@app.post("/api/auth/login")
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    row = get_user_by_email(email)
    if not row or not check_password_hash(row["password_hash"], password):
        return err("ایمیل یا گذرواژه اشتباه است.", "bad_credentials", 401)

    status = row["status"]
    if status == "pending":
        return err(
            "حساب شما در انتظار تأیید مدیر است؛ پس از تأیید می‌توانید وارد شوید.",
            "pending",
            403,
        )
    if status == "rejected":
        return err("درخواست عضویت شما رد شده است.", "rejected", 403)
    if status == "disabled":
        return err("حساب شما غیرفعال شده است؛ با مدیر در تماس باشید.", "disabled", 403)

    session.clear()
    session["uid"] = row["id"]
    session.permanent = True
    get_db().execute(
        "UPDATE users SET last_login = ? WHERE id = ?", (now_iso(), row["id"])
    )
    get_db().commit()
    return ok(user=user_to_dict(row))


@app.post("/api/auth/logout")
def logout():
    session.clear()
    return ok(message="خارج شدید.")


@app.get("/api/auth/me")
def me():
    uid = session.get("uid")
    if not uid:
        return err("وارد نشده‌اید.", "unauthorized", 401)
    user = get_user_by_id(uid)
    if not user or user["status"] != "active":
        session.clear()
        return err("نشست معتبر نیست.", "unauthorized", 401)
    return ok(user=user)


# ---------------------------------------------------------------- پروفایل کاربر
@app.get("/api/user/profile")
@login_required
def user_profile():
    return ok(user=g.me)


@app.put("/api/user/profile")
@login_required
def user_profile_update():
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    db = get_db()
    if name:
        db.execute("UPDATE users SET name = ? WHERE id = ?", (name, g.me["id"]))
    if new_password:
        row = db.execute(
            "SELECT password_hash FROM users WHERE id = ?", (g.me["id"],)
        ).fetchone()
        if not check_password_hash(row["password_hash"], current_password):
            return err("گذرواژه فعلی اشتباه است.", "bad_password", 403)
        if len(new_password) < 8:
            return err("گذرواژه جدید باید حداقل ۸ کاراکتر باشد.", "validation")
        db.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (generate_password_hash(new_password), g.me["id"]),
        )
    db.commit()
    return ok(user=get_user_by_id(g.me["id"]), message="پروفایل به‌روزرسانی شد.")


# ---------------------------------------------------------------- پیشرفت یادگیری
def _num(v, default=0):
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def merge_progress(a, b):
    """ادغام دو پیشرفت (سرور و کلاینت) — برای شمارنده‌ها max، برای خطاها union."""
    a = a or {}
    b = b or {}
    out = {}
    for k in ("xp", "streak", "done", "correctWords", "totalWords", "accSum", "wpmSum"):
        out[k] = max(_num(a.get(k)), _num(b.get(k)))
    out["lastDay"] = max(a.get("lastDay") or "", b.get("lastDay") or "") or None

    ld = {}
    for src in (a.get("levelDone") or {}, b.get("levelDone") or {}):
        for k, v in src.items():
            ld[str(k)] = max(_num(ld.get(str(k))), _num(v))
    out["levelDone"] = ld

    seen = set()
    merged = []
    for m in (a.get("mistakes") or []) + (b.get("mistakes") or []):
        en = (m or {}).get("en")
        if en and en not in seen:
            seen.add(en)
            merged.append({"en": en, "fa": m.get("fa", ""), "level": m.get("level")})
    out["mistakes"] = merged[-300:]
    return out


def get_progress(uid):
    row = (
        get_db()
        .execute("SELECT data FROM progress WHERE user_id = ?", (uid,))
        .fetchone()
    )
    if not row:
        return dict(EMPTY_PROGRESS)
    try:
        data = json.loads(row["data"])
    except (TypeError, ValueError):
        data = {}
    merged = dict(EMPTY_PROGRESS)
    merged.update(data)
    return merged


@app.get("/api/th/progress")
@login_required
def th_progress_get():
    return ok(progress=get_progress(g.me["id"]))


@app.post("/api/th/progress")
@login_required
def th_progress_post():
    data = request.get_json(silent=True) or {}
    client = data.get("progress") or {}
    if not isinstance(client, dict):
        return err("قالب پیشرفت معتبر نیست.", "validation")
    merged = merge_progress(get_progress(g.me["id"]), client)
    db = get_db()
    db.execute(
        "INSERT INTO progress(user_id, data, updated_at) VALUES (?, ?, ?)"
        " ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
        (g.me["id"], json.dumps(merged, ensure_ascii=False), now_iso()),
    )
    db.commit()
    return ok(progress=merged)


# ---------------------------------------------------------------- پنل ادمین
@app.get("/api/admin/stats")
@admin_required
def admin_stats():
    db = get_db()
    total = db.execute("SELECT COUNT(*) c FROM users").fetchone()["c"]
    by_status = {
        r["status"]: r["c"]
        for r in db.execute(
            "SELECT status, COUNT(*) c FROM users GROUP BY status"
        ).fetchall()
    }
    admins = db.execute(
        "SELECT COUNT(*) c FROM users WHERE role='admin' AND status='active'"
    ).fetchone()["c"]

    # آمار یادگیری تجمیعی
    xp_total = 0
    done_total = 0
    cw_total = 0
    tw_total = 0
    learners = 0
    level_done = {}
    for r in db.execute("SELECT data FROM progress").fetchall():
        try:
            d = json.loads(r["data"])
        except (TypeError, ValueError):
            continue
        learners += 1
        xp_total += _num(d.get("xp"))
        done_total += _num(d.get("done"))
        cw_total += _num(d.get("correctWords"))
        tw_total += _num(d.get("totalWords"))
        for k, v in (d.get("levelDone") or {}).items():
            level_done[str(k)] = level_done.get(str(k), 0) + _num(v)

    recent = [
        user_to_dict(r)
        for r in db.execute("SELECT * FROM users ORDER BY id DESC LIMIT 5").fetchall()
    ]
    return ok(
        stats={
            "total": total,
            "pending": by_status.get("pending", 0),
            "active": by_status.get("active", 0),
            "rejected": by_status.get("rejected", 0),
            "disabled": by_status.get("disabled", 0),
            "admins": admins,
            "learners": learners,
            "xp_total": xp_total,
            "done_total": done_total,
            "avg_acc": round(cw_total / tw_total * 100) if tw_total else 0,
            "level_done": level_done,
        },
        recent=recent,
    )


@app.get("/api/admin/users")
@admin_required
def admin_users():
    status = request.args.get("status")
    db = get_db()
    if status in STATUS_LABELS:
        rows = db.execute(
            "SELECT * FROM users WHERE status = ? ORDER BY id DESC", (status,)
        ).fetchall()
    else:
        rows = db.execute("SELECT * FROM users ORDER BY id DESC").fetchall()
    return ok(users=[user_to_dict(r) for r in rows])


@app.get("/api/admin/users/<int:uid>/progress")
@admin_required
def admin_user_progress(uid):
    row = get_db().execute("SELECT id FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        return err("کاربر پیدا نشد.", "not_found", 404)
    return ok(progress=get_progress(uid))


def _change_status(uid, new_status):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        return err("کاربر پیدا نشد.", "not_found", 404)
    if row["id"] == g.me["id"]:
        return err("نمی‌توانید وضعیت حساب خودتان را تغییر دهید.", "self_action", 403)
    db.execute("UPDATE users SET status = ? WHERE id = ?", (new_status, uid))
    db.commit()
    return ok(user=get_user_by_id(uid))


@app.post("/api/admin/users/<int:uid>/approve")
@admin_required
def admin_approve(uid):
    return _change_status(uid, "active")


@app.post("/api/admin/users/<int:uid>/reject")
@admin_required
def admin_reject(uid):
    return _change_status(uid, "rejected")


@app.post("/api/admin/users/<int:uid>/disable")
@admin_required
def admin_disable(uid):
    return _change_status(uid, "disabled")


@app.post("/api/admin/users/<int:uid>/enable")
@admin_required
def admin_enable(uid):
    return _change_status(uid, "active")


@app.put("/api/admin/users/<int:uid>")
@admin_required
def admin_update_user(uid):
    data = request.get_json(silent=True) or {}
    role = data.get("role")
    if role not in ("user", "admin"):
        return err("نقش معتبر نیست.", "validation")
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        return err("کاربر پیدا نشد.", "not_found", 404)
    if row["id"] == g.me["id"] and role != "admin":
        return err("نمی‌توانید نقش ادمین خودتان را بردارید.", "self_action", 403)
    db.execute("UPDATE users SET role = ? WHERE id = ?", (role, uid))
    db.commit()
    return ok(user=get_user_by_id(uid))


@app.delete("/api/admin/users/<int:uid>")
@admin_required
def admin_delete_user(uid):
    db = get_db()
    row = db.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    if not row:
        return err("کاربر پیدا نشد.", "not_found", 404)
    if row["id"] == g.me["id"]:
        return err("نمی‌توانید حساب خودتان را حذف کنید.", "self_action", 403)
    if row["role"] == "admin" and row["status"] == "active":
        remaining = db.execute(
            "SELECT COUNT(*) c FROM users WHERE role='admin' AND status='active' AND id != ?",
            (uid,),
        ).fetchone()["c"]
        if remaining == 0:
            return err("آخرین ادمین فعال را نمی‌توان حذف کرد.", "last_admin", 403)
    db.execute("DELETE FROM users WHERE id = ?", (uid,))
    db.commit()
    return ok(message="کاربر حذف شد.")


@app.get("/api/admin/settings")
@admin_required
def admin_settings_get():
    db = get_db()
    rows = db.execute("SELECT key, value FROM settings").fetchall()
    return ok(settings={r["key"]: r["value"] for r in rows})


@app.put("/api/admin/settings")
@admin_required
def admin_settings_put():
    data = request.get_json(silent=True) or {}
    allowed = {"site_name", "announcement", "max_plays"}
    db = get_db()
    for k in allowed:
        if k in data:
            v = str(data[k] or "").strip()
            if k == "site_name" and not v:
                return err("نام سایت نمی‌تواند خالی باشد.", "validation")
            if k == "max_plays":
                try:
                    iv = int(v)
                    if not 1 <= iv <= 10:
                        raise ValueError
                    v = str(iv)
                except ValueError:
                    return err("تعداد پخش باید عددی بین ۱ تا ۱۰ باشد.", "validation")
            db.execute(
                "INSERT INTO settings(key, value) VALUES (?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (k, v),
            )
    db.commit()
    rows = db.execute("SELECT key, value FROM settings").fetchall()
    return ok(
        settings={r["key"]: r["value"] for r in rows}, message="تنظیمات ذخیره شد."
    )


# ---------------------------------------------------------------- اجرا
if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", "8000"))
    app.run(host="127.0.0.1", port=port, debug=False)
