import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { securityConfig } from '../config';
import { SecurityEvent } from '../types';

export class SecurityManager {
  private static instance: SecurityManager;
  private readonly encryptionKey: Buffer;
  private readonly jwtSecret: string;

  private constructor() {
    this.encryptionKey = Buffer.from(securityConfig.encryptionKey, 'utf8');
    this.jwtSecret = securityConfig.jwtSecret;
  }

  public static getInstance(): SecurityManager {
    if (!SecurityManager.instance) {
      SecurityManager.instance = new SecurityManager();
    }
    return SecurityManager.instance;
  }

  /**
   * Encrypt sensitive data using AES-256-GCM
   */
  public encrypt(data: string): string {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipher('aes-256-gcm', this.encryptionKey);
      cipher.setAAD(Buffer.from('galaswap-trading-bot', 'utf8'));
      
      let encrypted = cipher.update(data, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();
      
      return iv.toString('hex') + ':' + authTag.toString('hex') + ':' + encrypted;
    } catch (error) {
      throw new Error(`Encryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Decrypt sensitive data using AES-256-GCM
   */
  public decrypt(encryptedData: string): string {
    try {
      const parts = encryptedData.split(':');
      if (parts.length !== 3) {
        throw new Error('Invalid encrypted data format');
      }

      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipher('aes-256-gcm', this.encryptionKey);
      decipher.setAAD(Buffer.from('galaswap-trading-bot', 'utf8'));
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error(`Decryption failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Hash password using bcrypt
   */
  public async hashPassword(password: string): Promise<string> {
    const saltRounds = 12;
    return await bcrypt.hash(password, saltRounds);
  }

  /**
   * Verify password against hash
   */
  public async verifyPassword(password: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(password, hash);
  }

  /**
   * Generate JWT token
   */
  public generateToken(payload: Record<string, any>, expiresIn: string = '24h'): string {
    return jwt.sign(payload, this.jwtSecret, { expiresIn });
  }

  /**
   * Verify JWT token
   */
  public verifyToken(token: string): any {
    try {
      return jwt.verify(token, this.jwtSecret);
    } catch (error) {
      throw new Error(`Token verification failed: ${error instanceof Error ? error.message : 'Invalid token'}`);
    }
  }

  /**
   * Generate cryptographically secure random string
   */
  public generateSecureRandom(length: number = 32): string {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Generate unique key for API requests
   */
  public generateUniqueKey(): string {
    const timestamp = Date.now().toString();
    const random = this.generateSecureRandom(16);
    return `${timestamp}-${random}`;
  }

  /**
   * Sign message with private key
   */
  public signMessage(message: string, privateKey: string): string {
    try {
      const sign = crypto.createSign('SHA256');
      sign.update(message);
      sign.end();
      return sign.sign(privateKey, 'hex');
    } catch (error) {
      throw new Error(`Message signing failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Verify message signature
   */
  public verifySignature(message: string, signature: string, publicKey: string): boolean {
    try {
      const verify = crypto.createVerify('SHA256');
      verify.update(message);
      verify.end();
      return verify.verify(publicKey, signature, 'hex');
    } catch (error) {
      return false;
    }
  }

  /**
   * Sanitize input to prevent injection attacks
   */
  public sanitizeInput(input: string): string {
    return input
      .replace(/[<>]/g, '') // Remove potential HTML tags
      .replace(/['"]/g, '') // Remove quotes
      .replace(/[;]/g, '') // Remove semicolons
      .trim();
  }

  /**
   * Validate wallet address format
   */
  public validateWalletAddress(address: string): boolean {
    return /^0x[a-fA-F0-9]{40}$/.test(address);
  }

  /**
   * Validate private key format
   */
  public validatePrivateKey(privateKey: string): boolean {
    return /^[a-fA-F0-9]{64}$/.test(privateKey);
  }

  /**
   * Create security event for monitoring
   */
  public createSecurityEvent(
    type: SecurityEvent['type'],
    severity: SecurityEvent['severity'],
    message: string,
    metadata?: Record<string, any>
  ): SecurityEvent {
    return {
      type,
      severity,
      message,
      timestamp: new Date(),
      metadata
    };
  }

  /**
   * Rate limiting check
   */
  private rateLimitMap = new Map<string, { count: number; resetTime: number }>();

  public checkRateLimit(identifier: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    const key = identifier;
    const current = this.rateLimitMap.get(key);

    if (!current || now > current.resetTime) {
      this.rateLimitMap.set(key, { count: 1, resetTime: now + windowMs });
      return true;
    }

    if (current.count >= limit) {
      return false;
    }

    current.count++;
    return true;
  }

  /**
   * Clean up expired rate limit entries
   */
  public cleanupRateLimits(): void {
    const now = Date.now();
    for (const [key, value] of this.rateLimitMap.entries()) {
      if (now > value.resetTime) {
        this.rateLimitMap.delete(key);
      }
    }
  }
}

// Export singleton instance
export const securityManager = SecurityManager.getInstance();
