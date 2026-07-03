import * as crypto from 'crypto';

export class CryptoHelper {
  private static readonly ALGORITHM = 'aes-256-gcm';
  private static readonly KEY_LENGTH = 32;
  private static readonly IV_LENGTH = 12;

  // Encrypt plaintext using a secure master key
  static encrypt(plaintext: string, masterKey: string): { encryptedText: string; salt: string } {
    const salt = crypto.randomBytes(16).toString('hex');
    // Derive key from masterKey and salt using PBKDF2
    const key = crypto.pbkdf2Sync(masterKey, salt, 100000, this.KEY_LENGTH, 'sha256');
    const iv = crypto.randomBytes(this.IV_LENGTH);
    const cipher = crypto.createCipheriv(this.ALGORITHM, key, iv);

    let encrypted = cipher.update(plaintext, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    const authTag = cipher.getAuthTag().toString('hex');
    
    // Combine iv, authTag, and encrypted data into one string
    const encryptedText = `${iv.toString('hex')}:${authTag}:${encrypted}`;

    return { encryptedText, salt };
  }

  // Decrypt encrypted text using the master key and salt
  static decrypt(encryptedText: string, salt: string, masterKey: string): string {
    const [ivHex, authTagHex, encryptedHex] = encryptedText.split(':');
    if (!ivHex || !authTagHex || !encryptedHex) {
      throw new Error('Invalid encrypted text format');
    }

    const key = crypto.pbkdf2Sync(masterKey, salt, 100000, this.KEY_LENGTH, 'sha256');
    const iv = Buffer.from(ivHex, 'hex');
    const authTag = Buffer.from(authTagHex, 'hex');
    const decipher = crypto.createDecipheriv(this.ALGORITHM, key, iv);

    decipher.setAuthTag(authTag);

    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  }
}
