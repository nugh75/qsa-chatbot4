"""Seed or promote an admin user for the application.

Usage (inside backend container):
    python -m app.seed_admin --email you@example.com --password NewSecurePassword123!

If the user does not exist it will be created (with minimal fields) and set is_admin=1.
If it exists it will just be promoted to admin.
Works for both SQLite and Postgres (placeholder adaptation handled by DatabaseManager).
"""
from __future__ import annotations
import argparse
import os
import hashlib
from .database import db_manager, USING_POSTGRES, DatabaseManager
from .password_utils import hash_password_bcrypt

DEFAULT_ESCROW_PLACEHOLDER = "ENCRYPTED_ESCROW_KEY_PLACEHOLDER"

def hash_password(pw: str) -> str:
    # Use bcrypt for new admin seed users
    return hash_password_bcrypt(pw)

def ensure_tables_postgres():
    if not USING_POSTGRES:
        return
    # Minimal schema creation for users table if empty database (id serial, is_admin boolean)
    with db_manager.get_connection() as conn:
        cur = conn.cursor()
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            user_key_hash TEXT NOT NULL,
            escrow_key_encrypted TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW(),
            last_login TIMESTAMP,
            is_active BOOLEAN DEFAULT TRUE,
            failed_login_attempts INTEGER DEFAULT 0,
            locked_until TIMESTAMP NULL,
            must_change_password BOOLEAN DEFAULT FALSE,
            is_admin BOOLEAN DEFAULT FALSE
        )
        """)
        conn.commit()

def seed_admin(email: str, password: str, overwrite_password: bool = True):
    ensure_tables_postgres()
    pw_hash = hash_password(password)
    user_key_hash = hashlib.sha256((email+":user_key").encode()).hexdigest()
    with db_manager.get_connection() as conn:
        c = conn.cursor()
        if USING_POSTGRES:
            c.execute("SELECT id, is_admin FROM users WHERE email = %s", (email,))
        else:
            c.execute("SELECT id, is_admin FROM users WHERE email = ?", (email,))
        row = c.fetchone()
        if row:
            user_id, is_admin = row[0], row[1]
            if USING_POSTGRES:
                if overwrite_password:
                    c.execute("UPDATE users SET is_admin = %s, password_hash = %s WHERE id = %s", (True, pw_hash, user_id))
                else:
                    c.execute("UPDATE users SET is_admin = %s WHERE id = %s", (True, user_id))
            else:
                if overwrite_password:
                    c.execute("UPDATE users SET is_admin = ?, password_hash = ? WHERE id = ?", (1, pw_hash, user_id))
                else:
                    c.execute("UPDATE users SET is_admin = ? WHERE id = ?", (1, user_id))
            action = "promoted" if not is_admin else ("updated" if overwrite_password else "promoted")
        else:
            if USING_POSTGRES:
                c.execute("INSERT INTO users (email, password_hash, user_key_hash, escrow_key_encrypted, is_admin) VALUES (%s, %s, %s, %s, %s) RETURNING id", (email, pw_hash, user_key_hash, DEFAULT_ESCROW_PLACEHOLDER, True))
            else:
                c.execute("INSERT INTO users (email, password_hash, user_key_hash, escrow_key_encrypted, is_admin) VALUES (?, ?, ?, ?, ?)", (email, pw_hash, user_key_hash, DEFAULT_ESCROW_PLACEHOLDER, 1))
            if USING_POSTGRES:
                user_id = c.fetchone()[0]
            else:
                user_id = c.lastrowid
            action = "created"
        conn.commit()
    print(f"Admin user {action}: email={email} id={user_id}")


def main():
    parser = argparse.ArgumentParser(description="Seed or promote admin user")
    parser.add_argument("--email", required=True)
    parser.add_argument("--password", required=True)
    parser.add_argument("--no-overwrite", action='store_true', help='Do not overwrite password if user exists')
    args = parser.parse_args()
    seed_admin(args.email, args.password, overwrite_password=not args.no_overwrite)

if __name__ == "__main__":
    main()
