-- Subscription requests: app admins request access; admin approves to create App + app_admin user
-- Run: mysql -u root -p security_verification < database/migrations/005_subscription_requests.sql

CREATE TABLE IF NOT EXISTS subscription_requests (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    email VARCHAR(200) NOT NULL,
    company VARCHAR(200) NULL,
    message TEXT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    reviewed_at DATETIME NULL,
    reviewed_by_id INT NULL,
    app_id INT NULL,
    INDEX ix_subscription_email (email),
    INDEX ix_subscription_status (status),
    INDEX ix_subscription_reviewed_by (reviewed_by_id),
    INDEX ix_subscription_app (app_id),
    FOREIGN KEY (reviewed_by_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (app_id) REFERENCES apps(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
