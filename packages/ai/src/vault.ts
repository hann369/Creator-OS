import { CryptoHelper } from '@pronoia/shared';

export interface VaultKeyRecord {
  encryptedKey: string;
  salt: string;
}

export class SecretVault {
  private masterKey: string;

  constructor(masterKey: string) {
    if (!masterKey || masterKey.length < 16) {
      throw new Error('Master key must be a secure string of at least 16 characters');
    }
    this.masterKey = masterKey;
  }

  // Encrypt an API key for storage
  encryptKey(apiKey: string): VaultKeyRecord {
    const { encryptedText, salt } = CryptoHelper.encrypt(apiKey, this.masterKey);
    return {
      encryptedKey: encryptedText,
      salt
    };
  }

  // Decrypt an API key retrieved from DB
  decryptKey(record: VaultKeyRecord): string {
    return CryptoHelper.decrypt(record.encryptedKey, record.salt, this.masterKey);
  }
}
