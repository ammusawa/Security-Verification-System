-- Migration 004: Create demo_requests table for Request Demo feature
-- Stores demo requests from the public landing page and admin-composed demo content.

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
