-- MySQL 8+
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NULL,
  phone VARCHAR(40) NULL,
  password_hash VARCHAR(255) NULL,
  google_sub VARCHAR(64) NULL,
  is_verified TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_phone (phone),
  UNIQUE KEY uq_users_google_sub (google_sub)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Guarda códigos OTP (sms/email). Armazene o código com hash (não em texto puro)
CREATE TABLE IF NOT EXISTS otp_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  identity VARCHAR(190) NOT NULL,
  identity_type ENUM('phone','email') NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_otp_identity (identity, identity_type),
  KEY idx_otp_expires (expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Se você já tem esse users em outro serviço, pode só apontar este backend para o MESMO banco.
