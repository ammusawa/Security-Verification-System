"""Run migration 004: Create demo_requests table."""
import pymysql
from dotenv import load_dotenv
import os

load_dotenv()

DB_HOST = os.getenv("DB_HOST", "localhost")
DB_PORT = int(os.getenv("DB_PORT", "3306"))
DB_USER = os.getenv("DB_USER", "root")
DB_PASS = os.getenv("DB_PASSWORD", "")
DB_NAME = os.getenv("DB_NAME", "security_verification")

conn = pymysql.connect(
    host=DB_HOST,
    port=DB_PORT,
    user=DB_USER,
    password=DB_PASS,
    database=DB_NAME,
    charset="utf8mb4",
)

try:
    with conn.cursor() as cur:
        cur.execute("""
            CREATE TABLE IF NOT EXISTS demo_requests (
                id INT AUTO_INCREMENT PRIMARY KEY,
                name VARCHAR(200) NOT NULL,
                email VARCHAR(200) NOT NULL,
                company VARCHAR(200) NULL,
                message TEXT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'pending',
                demo_token VARCHAR(64) NOT NULL,
                demo_subject VARCHAR(300) NULL,
                demo_content TEXT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                sent_at DATETIME NULL,
                viewed_at DATETIME NULL,
                UNIQUE KEY uq_demo_token (demo_token),
                INDEX ix_demo_email (email),
                INDEX ix_demo_status (status),
                INDEX ix_demo_token (demo_token)
            ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        """)
        conn.commit()
        print("Migration 004 complete: demo_requests table created.")

        # Verify
        cur.execute("DESCRIBE demo_requests")
        cols = cur.fetchall()
        print(f"\nColumns ({len(cols)}):")
        for col in cols:
            print(f"  {col[0]:20s} {col[1]}")
finally:
    conn.close()
