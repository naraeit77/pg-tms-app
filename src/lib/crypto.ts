/**
 * 암호화/복호화 유틸리티
 * 대상 DB 비밀번호를 AES-256-GCM으로 암호화/복호화
 */

import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || 'default-key-change-this-in-prod';
const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16; // AES block size
const SALT_LENGTH = 64;
const TAG_LENGTH = 16;
const KEY_LENGTH = 32; // 256 bits

/**
 * Encryption Key 파생 (PBKDF2 사용)
 */
function deriveKey(password: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(password, salt, 100000, KEY_LENGTH, 'sha256');
}

/**
 * 문자열을 AES-256-GCM으로 암호화
 */
export function encrypt(text: string): string {
  if (!text) return '';

  try {
    // Salt 생성
    const salt = crypto.randomBytes(SALT_LENGTH);

    // Key 파생
    const key = deriveKey(ENCRYPTION_KEY, salt);

    // IV(Initialization Vector) 생성
    const iv = crypto.randomBytes(IV_LENGTH);

    // Cipher 생성
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

    // 암호화
    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    // Auth Tag 가져오기
    const authTag = cipher.getAuthTag();

    // salt:iv:authTag:encrypted 형식으로 결합
    const result = Buffer.concat([
      salt,
      iv,
      authTag,
      Buffer.from(encrypted, 'hex'),
    ]).toString('base64');

    return result;
  } catch (error) {
    console.error('Encryption error:', error);
    throw new Error('암호화 중 오류가 발생했습니다');
  }
}

/**
 * AES-256-GCM 암호화된 문자열을 복호화
 */
export function decrypt(encryptedText: string): string {
  if (!encryptedText) return '';

  try {
    // Base64 디코딩
    const buffer = Buffer.from(encryptedText, 'base64');

    // Salt 추출
    const salt = buffer.subarray(0, SALT_LENGTH);

    // IV 추출
    const iv = buffer.subarray(SALT_LENGTH, SALT_LENGTH + IV_LENGTH);

    // Auth Tag 추출
    const authTag = buffer.subarray(
      SALT_LENGTH + IV_LENGTH,
      SALT_LENGTH + IV_LENGTH + TAG_LENGTH
    );

    // 암호화된 데이터 추출
    const encryptedData = buffer.subarray(SALT_LENGTH + IV_LENGTH + TAG_LENGTH);

    // Key 파생
    const key = deriveKey(ENCRYPTION_KEY, salt);

    // Decipher 생성
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    // 복호화
    let decrypted = decipher.update(encryptedData.toString('hex'), 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    console.error('Decryption error:', error);
    throw new Error('복호화 중 오류가 발생했습니다');
  }
}

/**
 * 암호화 키 유효성 검사
 */
export function validateEncryptionKey(): boolean {
  return ENCRYPTION_KEY !== 'default-key-change-this-in-prod' && ENCRYPTION_KEY.length >= 32;
}
