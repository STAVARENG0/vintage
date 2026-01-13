-- Vintage Auth Server schema (MySQL 8+ recommended)

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(40) NULL,
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_email (email),
  UNIQUE KEY uniq_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Stores verification/reset OTP and (for register) the pending payload.
CREATE TABLE IF NOT EXISTS auth_otps (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  purpose ENUM('register','reset') NOT NULL,
  channel ENUM('email','sms') NOT NULL,
  contact VARCHAR(190) NOT NULL,           -- email or phone (normalized)
  code_salt VARCHAR(64) NOT NULL,
  code_hash VARCHAR(64) NOT NULL,
  payload_json JSON NULL,                 -- for register: {name, email/phone, password_hash}
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uniq_purpose_contact (purpose, contact),
  KEY idx_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
