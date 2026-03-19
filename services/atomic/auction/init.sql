CREATE DATABASE IF NOT EXISTS auctiondb;
USE auctiondb;

CREATE TABLE IF NOT EXISTS auctions (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    camera_id           INT                                     NOT NULL,
    seller_id           INT                                     NOT NULL,
    start_price         DOUBLE                                  NOT NULL,
    current_highest_bid DOUBLE                                  DEFAULT 0.0,
    highest_bidder_id   INT,
    end_time            TIMESTAMP                               NOT NULL,
    status              ENUM('active','completed','failed')     DEFAULT 'active'
);

-- Seed: one live demo auction (ends 7 days from container first-start)
INSERT IGNORE INTO auctions (id, camera_id, seller_id, start_price, current_highest_bid, end_time, status) VALUES
    (1, 1, 1, 4500.00, 0.00, DATE_ADD(NOW(), INTERVAL 7 DAY), 'active');
