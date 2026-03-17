#!/usr/bin/env python3
"""
Run MySQL schema for Security Verification System.
Creates the database if missing, then applies schema.sql.
Uses MYSQL_* from environment or backend/.env.
"""
import os
import re
import sys
from pathlib import Path

# Project root = parent of database/
SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = SCRIPT_DIR.parent
SCHEMA_FILE = SCRIPT_DIR / "schema.sql"
ENV_FILE = PROJECT_ROOT / "backend" / ".env"


def load_env():
    """Load backend/.env into os.environ (for MYSQL_*)."""
    if not ENV_FILE.exists():
        return
    with open(ENV_FILE, encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            m = re.match(r"([^=]+)=(.*)$", line)
            if m:
                key = m.group(1).strip()
                value = m.group(2).strip().strip("'\"").strip()
                os.environ.setdefault(key, value)


def main():
    load_env()
    host = os.environ.get("MYSQL_HOST", "localhost")
    port = int(os.environ.get("MYSQL_PORT", "3306"))
    user = os.environ.get("MYSQL_USER", "root")
    password = os.environ.get("MYSQL_PASSWORD", "")
    database = os.environ.get("MYSQL_DATABASE", "security_verification")

    try:
        import pymysql
    except ImportError:
        print("PyMySQL is required. Run: pip install pymysql", file=sys.stderr)
        sys.exit(1)

    if not SCHEMA_FILE.exists():
        print(f"Schema file not found: {SCHEMA_FILE}", file=sys.stderr)
        sys.exit(1)

    print(f"Database: {database} @ {host}:{port} (user: {user})")

    conn_params = {
        "host": host,
        "port": port,
        "user": user,
        "password": password or None,
        "charset": "utf8mb4",
    }

    # 1) Create database if not exists
    print("Creating database (if not exists)...")
    try:
        conn = pymysql.connect(**conn_params)
        with conn.cursor() as cur:
            cur.execute(
                f"CREATE DATABASE IF NOT EXISTS `{database}` "
                "CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
            )
        conn.close()
    except pymysql.Error as e:
        print(f"Failed to create database: {e}", file=sys.stderr)
        sys.exit(1)
    print("Database ready.")

    # 2) Run schema.sql
    print("Applying schema.sql...")
    conn_params["database"] = database
    with open(SCHEMA_FILE, encoding="utf-8") as f:
        sql = f.read()

    # Strip single-line comments and split into statements
    statements = []
    for line in sql.splitlines():
        line = line.strip()
        if line.startswith("--") or not line:
            continue
        statements.append(line)
    full_sql = " ".join(statements)
    for stmt in re.split(r";\s*", full_sql):
        stmt = stmt.strip()
        if not stmt:
            continue
        try:
            conn = pymysql.connect(**conn_params)
            with conn.cursor() as cur:
                cur.execute(stmt)
            conn.commit()
            conn.close()
        except pymysql.Error as e:
            print(f"Failed to execute statement: {e}", file=sys.stderr)
            print(f"Statement: {stmt[:80]}...", file=sys.stderr)
            sys.exit(1)

    print("Schema applied successfully.")


if __name__ == "__main__":
    main()
