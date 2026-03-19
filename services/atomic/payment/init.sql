CREATE DATABASE IF NOT EXISTS paymentdb;
USE paymentdb;

CREATE TABLE IF NOT EXISTS payments (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    order_id          INT         NOT NULL,
    stripe_payment_id VARCHAR(255),
    amount            DOUBLE      NOT NULL,
    status            VARCHAR(50) DEFAULT 'pending',
    created_at        TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);
