CREATE DATABASE IF NOT EXISTS userdb;
USE userdb;

CREATE TABLE IF NOT EXISTS users (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    name        VARCHAR(255)            NOT NULL,
    email       VARCHAR(255)            NOT NULL UNIQUE,
    telegram_id VARCHAR(255),
    role        ENUM('buyer','seller')  NOT NULL,
    created_at  TIMESTAMP               DEFAULT CURRENT_TIMESTAMP
);

-- Seed: one seller and one buyer for local testing
INSERT IGNORE INTO users (id, name, email, telegram_id, role) VALUES
    (1, 'Alice Seller', 'alice@test.com', '@aliceseller', 'seller'),
    (2, 'Bob Buyer',    'bob@test.com',   '@bobbuyer',    'buyer');
