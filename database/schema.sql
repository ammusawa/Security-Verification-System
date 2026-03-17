-- Security Verification System - MySQL schema (full)
-- Run after creating the database: mysql -u root -p security_verification < database/schema.sql
-- Or: mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS security_verification;" && mysql -u root -p security_verification < database/schema.sql

-- =============================================================================
-- 1. Apps (tenants for auth-as-a-service)
-- =============================================================================
CREATE TABLE IF NOT EXISTS apps (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(120) NOT NULL,
    owner_email VARCHAR(200) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_app_name (name),
    INDEX ix_app_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- 2. API keys (hashed, prefix for fast lookup; per app)
-- =============================================================================
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

-- =============================================================================
-- 3. Users (optionally scoped to an app; roles: user, app_admin, super_admin)
-- =============================================================================
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    app_id INT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    username VARCHAR(80) NOT NULL,
    email VARCHAR(120) NOT NULL,
    password_hash VARCHAR(128) NOT NULL,
    totp_secret VARCHAR(32) NULL,
    face_encoding_blob LONGBLOB NULL,
    face_encodings_json TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_username (username),
    UNIQUE KEY uq_email (email),
    INDEX ix_username (username),
    INDEX ix_email (email),
    INDEX ix_app_id (app_id),
    INDEX ix_role (role),
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- 4. Password reset tokens (single-use, short-lived)
-- =============================================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    token_hash VARCHAR(128) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_password_reset_user_id (user_id),
    INDEX ix_password_reset_expires_at (expires_at),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- 5. Trusted contexts (per user; IP, user_agent, geo)
-- =============================================================================
CREATE TABLE IF NOT EXISTS trusted_contexts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent VARCHAR(512) NOT NULL,
    geo_data TEXT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    INDEX ix_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- 6. Login attempts (in-progress login sessions; optional user_id before identify)
-- =============================================================================
CREATE TABLE IF NOT EXISTS login_attempts (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    session_token VARCHAR(64) NOT NULL,
    step VARCHAR(32) NOT NULL DEFAULT 'password_sent',
    otp_code_hash VARCHAR(128) NULL,
    otp_expires_at DATETIME NULL,
    ip_address VARCHAR(45) NOT NULL,
    user_agent VARCHAR(512) NOT NULL,
    geo_data TEXT NULL,
    verification_level_required INT NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    expires_at DATETIME NOT NULL,
    UNIQUE KEY uq_session_token (session_token),
    INDEX ix_session_token (session_token),
    INDEX ix_user_id (user_id),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =============================================================================
-- 7. Demo requests (landing page; admin composes and sends demo content)
-- =============================================================================
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

-- =============================================================================
-- 8. Subscription requests (app admin subscribe; admin approves → creates App + User)
-- =============================================================================
CREATE TABLE IF NOT EXISTS subscription_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200) NOT NULL,
    company VARCHAR(200) NULL,
    message TEXT NULL,
    plan_type VARCHAR(20) NOT NULL DEFAULT 'monthly',
    amount DECIMAL(10,2) NULL,
    currency VARCHAR(3) NULL DEFAULT 'NGN',
    payment_reference VARCHAR(200) NULL,
    receipt_filename VARCHAR(255) NULL,
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,
    reviewed_by_id INT NULL,
    app_id INT NULL,
    INDEX ix_subscription_email (email),
    INDEX ix_subscription_status (status),
    INDEX ix_subscription_plan (plan_type),
    INDEX ix_subscription_payment_status (payment_status),
    INDEX ix_subscription_reviewed_by (reviewed_by_id),
    INDEX ix_subscription_app (app_id),
    FOREIGN KEY (reviewed_by_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
