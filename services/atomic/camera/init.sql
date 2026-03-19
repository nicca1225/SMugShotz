CREATE DATABASE IF NOT EXISTS cameradb;
USE cameradb;

CREATE TABLE IF NOT EXISTS cameras (
    id                INT AUTO_INCREMENT PRIMARY KEY,
    seller_id         INT             NOT NULL,
    model             VARCHAR(255)    NOT NULL,
    shutter_count     INT,
    description       TEXT,
    condition_score   FLOAT,
    ai_condition_score FLOAT,
    s3_image_url      VARCHAR(512),
    status            VARCHAR(50)     DEFAULT 'pending',
    created_at        TIMESTAMP       DEFAULT CURRENT_TIMESTAMP
);

-- Seed: one demo camera for local testing
INSERT IGNORE INTO cameras (id, seller_id, model, shutter_count, description, condition_score, ai_condition_score, status) VALUES
    (1, 1, 'Fujifilm GFX100 II', 5200, 'Excellent condition, barely used. Includes original box and accessories.', 0.92, 0.90, 'active');
