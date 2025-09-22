// Core trading types and interfaces

export interface GalaSwapConfig {
  walletAddress: string;
  privateKey: string;
  publicKey: string;
  apiBaseUrl: string;
  apiTimeout: number;
  rateLimit: number;
}

export interface TradingConfig {
  defaultSlippage: number;
  maxPositionSize: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  maxTradeAmount: number;
}

export interface SecurityConfig {
  jwtSecret: string;
  encryptionKey: string;
  corsOrigin: string;
  monitoringEnabled: boolean;
}

export interface LoggingConfig {
  level: string;
  filePath: string;
}

export interface AppConfig {
  port: number;
  nodeEnv: string;
  databaseUrl?: string;
}

export interface TradeRequest {
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOutMin: string;
  deadline: number;
  uniqueKey: string;
  signerPublicKey: string;
  signature: string;
}

export interface TradeResponse {
  success: boolean;
  transactionHash?: string;
  error?: string;
  data?: any;
}

export interface TokenInfo {
  address: string;
  symbol: string;
  name: string;
  decimals: number;
  price?: number;
  liquidity?: number;
}

export interface TradingPair {
  token0: TokenInfo;
  token1: TokenInfo;
  reserve0: string;
  reserve1: string;
  price: number;
  liquidity: string;
}

export interface Position {
  id: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  amountOut: string;
  entryPrice: number;
  currentPrice: number;
  stopLoss?: number;
  takeProfit?: number;
  status: 'open' | 'closed' | 'stopped';
  createdAt: Date;
  updatedAt: Date;
}

export interface TradingStrategy {
  name: string;
  enabled: boolean;
  parameters: Record<string, any>;
  riskLevel: 'low' | 'medium' | 'high';
}

export interface MarketData {
  timestamp: number;
  price: number;
  volume: number;
  high24h: number;
  low24h: number;
  change24h: number;
}

export interface RiskMetrics {
  totalExposure: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
}

export interface SecurityEvent {
  type: 'authentication' | 'authorization' | 'api_call' | 'trade_execution' | 'error';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
  timestamp: number;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
