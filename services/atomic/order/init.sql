CREATE DATABASE IF NOT EXISTS orderdb;
USE orderdb;

CREATE TABLE IF NOT EXISTS orders (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    auction_id  INT         NOT NULL,
    buyer_id    INT         NOT NULL,
    seller_id   INT         NOT NULL,
    amount      DOUBLE      NOT NULL,
    status      VARCHAR(50) DEFAULT 'pending',
    created_at  TIMESTAMP   DEFAULT CURRENT_TIMESTAMP
);
