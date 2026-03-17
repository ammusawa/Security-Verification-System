-- Subscription plans (monthly/yearly) and payment/receipt for validation
-- Run: mysql -u root -p security_verification < database/migrations/006_subscription_plans_payment.sql

ALTER TABLE subscription_requests
  ADD COLUMN plan_type VARCHAR(20) NOT NULL DEFAULT 'monthly' AFTER message,
  ADD COLUMN amount DECIMAL(10,2) NULL AFTER plan_type,
  ADD COLUMN currency VARCHAR(3) NULL DEFAULT 'NGN' AFTER amount,
  ADD COLUMN payment_reference VARCHAR(200) NULL AFTER currency,
  ADD COLUMN receipt_filename VARCHAR(255) NULL AFTER payment_reference,
  ADD COLUMN payment_status VARCHAR(20) NOT NULL DEFAULT 'pending' AFTER receipt_filename;

ALTER TABLE subscription_requests
  ADD INDEX ix_subscription_plan (plan_type),
  ADD INDEX ix_subscription_payment_status (payment_status);
