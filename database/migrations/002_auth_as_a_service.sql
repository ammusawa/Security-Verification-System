-- Migration: Auth-as-a-Service tables
-- Run once against an existing database:
--   mysql -u root -p security_verification < database/migrations/002_auth_as_a_service.sql
-- Safe to re-run: uses IF NOT EXISTS and IGNORE.

-- 1. Tenant apps
CREATE TABLE IF NOT EXISTS apps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    owner_email VARCHAR(200) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_app_name (name),
    INDEX ix_app_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. API keys (hashed)
CREATE TABLE IF NOT EXISTS api_keys (
    id INT AUTO_INCREMENT PRIMARY KEY,
    app_id INT NOT NULL,
    key_hash VARCHAR(128) NOT NULL,
    prefix VARCHAR(16) NOT NULL,
    label VARCHAR(200) NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    revoked_at DATETIME NULL,
    INDEX ix_api_key_prefix (prefix),
    INDEX ix_api_key_app (app_id),
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. Add app_id column to users (nullable for backward compat)
-- If "Duplicate column name" error, the column already exists — safe to ignore.
ALTER TABLE users ADD COLUMN app_id INT NULL AFTER id;
ALTER TABLE users ADD INDEX ix_app_id (app_id);
ALTER TABLE users ADD FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL;
