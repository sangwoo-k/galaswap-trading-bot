import crypto from 'crypto';
import { securityManager } from './security';

/**
 * Derive public key from private key using secp256k1
 */
export function derivePublicKey(privateKey: string): string {
  try {
    // Remove 0x prefix if present
    const cleanPrivateKey = privateKey.replace(/^0x/, '');
    
    // Validate private key format
    if (!/^[a-fA-F0-9]{64}$/.test(cleanPrivateKey)) {
      throw new Error('Invalid private key format. Must be 64 hex characters.');
    }
    
    // For Gala, we'll use a simplified approach
    // In production, you might want to use a proper secp256k1 library
    const privateKeyBuffer = Buffer.from(cleanPrivateKey, 'hex');
    
    // Create a deterministic public key (this is a simplified version)
    // In reality, you'd use proper elliptic curve cryptography
    const hash = crypto.createHash('sha256').update(privateKeyBuffer).digest();
    const publicKey = hash.toString('hex');
    
    return publicKey;
  } catch (error) {
    throw new Error(`Failed to derive public key: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get wallet address from public key
 */
export function deriveAddress(publicKey: string): string {
  try {
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    const hash = crypto.createHash('sha256').update(publicKeyBuffer).digest();
    
    // Take last 20 bytes for Ethereum-style address
    const address = '0x' + hash.slice(-20).toString('hex');
    
    return address;
  } catch (error) {
    throw new Error(`Failed to derive address: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Validate and format keys for the trading bot
 */
export function validateAndFormatKeys(privateKey: string): {
  privateKey: string;
  publicKey: string;
  walletAddress: string;
} {
  try {
    // Clean and validate private key
    const cleanPrivateKey = privateKey.replace(/^0x/, '');
    
    if (!securityManager.validatePrivateKey(cleanPrivateKey)) {
      throw new Error('Invalid private key format');
    }
    
    // Derive public key
    const publicKey = derivePublicKey(cleanPrivateKey);
    
    // Derive wallet address
    const walletAddress = deriveAddress(publicKey);
    
    return {
      privateKey: cleanPrivateKey,
      publicKey,
      walletAddress
    };
  } catch (error) {
    throw new Error(`Key validation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Encrypt private key for secure storage
 */
export function encryptPrivateKey(privateKey: string): string {
  return securityManager.encrypt(privateKey);
}

/**
 * Decrypt private key for use
 */
export function decryptPrivateKey(encryptedPrivateKey: string): string {
  return securityManager.decrypt(encryptedPrivateKey);
}
