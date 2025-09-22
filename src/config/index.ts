import dotenv from 'dotenv';
import { GalaSwapConfig, TradingConfig, SecurityConfig, LoggingConfig, AppConfig } from '../types';

// Load environment variables
dotenv.config();

// Validate required environment variables
const requiredEnvVars = [
  'GALA_WALLET_ADDRESS',
  'GALA_PRIVATE_KEY',
  'GALA_PUBLIC_KEY',
  'JWT_SECRET',
  'ENCRYPTION_KEY'
];

for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    throw new Error(`Missing required environment variable: ${envVar}`);
  }
}

// GalaSwap API Configuration
export const galaSwapConfig: GalaSwapConfig = {
  walletAddress: process.env.GALA_WALLET_ADDRESS!,
  privateKey: process.env.GALA_PRIVATE_KEY!,
  publicKey: process.env.GALA_PUBLIC_KEY!,
  apiBaseUrl: process.env.GALA_API_BASE_URL || 'https://galaswap.gala.com',
  apiTimeout: parseInt(process.env.GALA_API_TIMEOUT || '30000'),
  rateLimit: parseInt(process.env.API_RATE_LIMIT || '100')
};

// Trading Configuration
export const tradingConfig: TradingConfig = {
  defaultSlippage: parseFloat(process.env.DEFAULT_SLIPPAGE || '0.5'),
  maxPositionSize: parseFloat(process.env.MAX_POSITION_SIZE || '0.1'),
  stopLossPercentage: parseFloat(process.env.STOP_LOSS_PERCENTAGE || '5'),
  takeProfitPercentage: parseFloat(process.env.TAKE_PROFIT_PERCENTAGE || '10'),
  maxTradeAmount: parseFloat(process.env.MAX_TRADE_AMOUNT || '1000')
};

// Security Configuration
export const securityConfig: SecurityConfig = {
  jwtSecret: process.env.JWT_SECRET!,
  encryptionKey: process.env.ENCRYPTION_KEY!,
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  monitoringEnabled: process.env.MONITORING_ENABLED === 'true'
};

// Logging Configuration
export const loggingConfig: LoggingConfig = {
  level: process.env.LOG_LEVEL || 'info',
  filePath: process.env.LOG_FILE_PATH || './logs/trading-bot.log'
};

// Application Configuration
export const appConfig: AppConfig = {
  port: parseInt(process.env.PORT || '3000'),
  nodeEnv: process.env.NODE_ENV || 'development',
  databaseUrl: process.env.DATABASE_URL
};

// Validate configuration
export function validateConfig(): void {
  // Validate wallet address format
  if (!galaSwapConfig.walletAddress.match(/^0x[a-fA-F0-9]{40}$/)) {
    throw new Error('Invalid Gala wallet address format');
  }

  // Validate private key format
  if (!galaSwapConfig.privateKey.match(/^[a-fA-F0-9]{64}$/)) {
    throw new Error('Invalid private key format');
  }

  // Validate encryption key length
  if (securityConfig.encryptionKey.length !== 32) {
    throw new Error('Encryption key must be exactly 32 characters');
  }

  // Validate trading parameters
  if (tradingConfig.defaultSlippage < 0 || tradingConfig.defaultSlippage > 50) {
    throw new Error('Default slippage must be between 0 and 50 percent');
  }

  if (tradingConfig.maxPositionSize <= 0 || tradingConfig.maxPositionSize > 1) {
    throw new Error('Max position size must be between 0 and 1');
  }

  if (tradingConfig.stopLossPercentage <= 0 || tradingConfig.stopLossPercentage > 100) {
    throw new Error('Stop loss percentage must be between 0 and 100');
  }

  if (tradingConfig.takeProfitPercentage <= 0 || tradingConfig.takeProfitPercentage > 1000) {
    throw new Error('Take profit percentage must be between 0 and 1000');
  }
}

// Initialize configuration validation
validateConfig();
