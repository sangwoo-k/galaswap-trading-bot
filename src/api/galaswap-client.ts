import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { galaSwapConfig } from '../config';
import { securityManager } from '../utils/security';
import { appLogger } from '../utils/logger';
import { monitoringSystem } from '../utils/monitoring';
import { 
  TradeRequest, 
  TradeResponse, 
  TokenInfo, 
  TradingPair, 
  MarketData,
  ApiResponse 
} from '../types';

export class GalaSwapClient {
  private static instance: GalaSwapClient;
  private client: AxiosInstance;
  private readonly walletAddress: string;
  private readonly privateKey: string;
  private readonly publicKey: string;

  private constructor() {
    this.walletAddress = galaSwapConfig.walletAddress;
    this.privateKey = galaSwapConfig.privateKey;
    this.publicKey = galaSwapConfig.publicKey;

    this.client = axios.create({
      baseURL: galaSwapConfig.apiBaseUrl,
      timeout: galaSwapConfig.apiTimeout,
      headers: {
        'Content-Type': 'application/json',
        'X-Wallet-Address': this.walletAddress,
        'User-Agent': 'GalaSwap-Trading-Bot/1.0.0'
      }
    });

    this.setupInterceptors();
  }

  public static getInstance(): GalaSwapClient {
    if (!GalaSwapClient.instance) {
      GalaSwapClient.instance = new GalaSwapClient();
    }
    return GalaSwapClient.instance;
  }

  private setupInterceptors(): void {
    // Request interceptor for logging and rate limiting
    this.client.interceptors.request.use(
      (config) => {
        const startTime = Date.now();
        config.metadata = { startTime };

        // Check rate limit
        if (!securityManager.checkRateLimit('galaswap-api', galaSwapConfig.rateLimit, 60000)) {
          throw new Error('Rate limit exceeded');
        }

        appLogger.logApiCall(
          config.method?.toUpperCase() || 'UNKNOWN',
          config.url || '',
          0, // Will be updated in response interceptor
          0, // Will be updated in response interceptor
          config.data
        );

        return config;
      },
      (error) => {
        appLogger.logError(error, { operation: 'api_request_interceptor' });
        return Promise.reject(error);
      }
    );

    // Response interceptor for logging and monitoring
    this.client.interceptors.response.use(
      (response) => {
        const endTime = Date.now();
        const startTime = response.config.metadata?.startTime || endTime;
        const responseTime = endTime - startTime;

        monitoringSystem.recordApiCall(true, responseTime);

        appLogger.logApiCall(
          response.config.method?.toUpperCase() || 'UNKNOWN',
          response.config.url || '',
          response.status,
          responseTime,
          response.config.data,
          response.data
        );

        return response;
      },
      (error) => {
        const endTime = Date.now();
        const startTime = error.config?.metadata?.startTime || endTime;
        const responseTime = endTime - startTime;

        monitoringSystem.recordApiCall(false, responseTime);

        appLogger.logError(error, {
          operation: 'api_response_interceptor',
          statusCode: error.response?.status,
          responseTime
        });

        return Promise.reject(error);
      }
    );
  }

  /**
   * Get token information
   */
  public async getTokenInfo(tokenAddress: string): Promise<TokenInfo> {
    try {
      const response = await this.client.get(`/api/token/${tokenAddress}`);
      return this.validateTokenInfo(response.data);
    } catch (error) {
      appLogger.logError(error as Error, { operation: 'getTokenInfo', tokenAddress });
      throw new Error(`Failed to get token info: ${(error as Error).message}`);
    }
  }

  /**
   * Get trading pairs
   */
  public async getTradingPairs(): Promise<TradingPair[]> {
    try {
      const response = await this.client.get('/api/pairs');
      return this.validateTradingPairs(response.data);
    } catch (error) {
      appLogger.logError(error as Error, { operation: 'getTradingPairs' });
      throw new Error(`Failed to get trading pairs: ${(error as Error).message}`);
    }
  }

  /**
   * Get market data for a token pair
   */
  public async getMarketData(tokenIn: string, tokenOut: string): Promise<MarketData> {
    try {
      const response = await this.client.get(`/api/market/${tokenIn}/${tokenOut}`);
      return this.validateMarketData(response.data);
    } catch (error) {
      appLogger.logError(error as Error, { operation: 'getMarketData', tokenIn, tokenOut });
      throw new Error(`Failed to get market data: ${(error as Error).message}`);
    }
  }

  /**
   * Get quote for a trade
   */
  public async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<{
    amountOut: string;
    priceImpact: number;
    minimumReceived: string;
  }> {
    try {
      const response = await this.client.get('/api/quote', {
        params: {
          tokenIn,
          tokenOut,
          amountIn
        }
      });

      return {
        amountOut: response.data.amountOut,
        priceImpact: parseFloat(response.data.priceImpact),
        minimumReceived: response.data.minimumReceived
      };
    } catch (error) {
      appLogger.logError(error as Error, { operation: 'getQuote', tokenIn, tokenOut, amountIn });
      throw new Error(`Failed to get quote: ${(error as Error).message}`);
    }
  }

  /**
   * Execute a trade
   */
  public async executeTrade(tradeRequest: Omit<TradeRequest, 'signerPublicKey' | 'signature' | 'uniqueKey'>): Promise<TradeResponse> {
    try {
      // Generate unique key for this trade
      const uniqueKey = securityManager.generateUniqueKey();
      
      // Create the message to sign
      const message = this.createTradeMessage({
        ...tradeRequest,
        uniqueKey
      });

      // Sign the message
      const signature = securityManager.signMessage(message, this.privateKey);

      // Prepare the complete trade request
      const completeTradeRequest: TradeRequest = {
        ...tradeRequest,
        uniqueKey,
        signerPublicKey: this.publicKey,
        signature
      };

      // Execute the trade
      const response = await this.client.post('/api/trade', completeTradeRequest);

      const tradeResponse: TradeResponse = {
        success: response.data.success,
        transactionHash: response.data.transactionHash,
        data: response.data.data
      };

      // Log the trade
      appLogger.logTrade('execute', {
        tokenIn: tradeRequest.tokenIn,
        tokenOut: tradeRequest.tokenOut,
        amountIn: tradeRequest.amountIn,
        amountOut: response.data.amountOut || '0',
        price: parseFloat(tradeRequest.amountIn) / parseFloat(response.data.amountOut || '1'),
        transactionHash: tradeResponse.transactionHash
      });

      // Record in monitoring system
      monitoringSystem.recordTrade(
        tradeResponse.success,
        parseFloat(tradeRequest.amountIn),
        tradeResponse.error
      );

      return tradeResponse;
    } catch (error) {
      const errorMessage = (error as Error).message;
      appLogger.logError(error as Error, { operation: 'executeTrade', tradeRequest });

      // Record failed trade
      monitoringSystem.recordTrade(false, parseFloat(tradeRequest.amountIn), errorMessage);

      return {
        success: false,
        error: errorMessage
      };
    }
  }

  /**
   * Get account balance
   */
  public async getBalance(tokenAddress: string): Promise<string> {
    try {
      const response = await this.client.get(`/api/balance/${tokenAddress}`, {
        headers: {
          'X-Wallet-Address': this.walletAddress
        }
      });

      return response.data.balance;
    } catch (error) {
      appLogger.logError(error as Error, { operation: 'getBalance', tokenAddress });
      throw new Error(`Failed to get balance: ${(error as Error).message}`);
    }
  }

  /**
   * Get transaction status
   */
  public async getTransactionStatus(transactionHash: string): Promise<{
    status: 'pending' | 'confirmed' | 'failed';
    confirmations: number;
    blockNumber?: number;
  }> {
    try {
      const response = await this.client.get(`/api/transaction/${transactionHash}`);
      return {
        status: response.data.status,
        confirmations: response.data.confirmations,
        blockNumber: response.data.blockNumber
      };
    } catch (error) {
      appLogger.logError(error as Error, { operation: 'getTransactionStatus', transactionHash });
      throw new Error(`Failed to get transaction status: ${(error as Error).message}`);
    }
  }

  /**
   * Create message for signing
   */
  private createTradeMessage(tradeData: {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOutMin: string;
    deadline: number;
    uniqueKey: string;
  }): string {
    return JSON.stringify({
      tokenIn: tradeData.tokenIn,
      tokenOut: tradeData.tokenOut,
      amountIn: tradeData.amountIn,
      amountOutMin: tradeData.amountOutMin,
      deadline: tradeData.deadline,
      uniqueKey: tradeData.uniqueKey,
      walletAddress: this.walletAddress,
      timestamp: Date.now()
    });
  }

  /**
   * Validate token info response
   */
  private validateTokenInfo(data: any): TokenInfo {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid token info response');
    }

    const requiredFields = ['address', 'symbol', 'name', 'decimals'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return {
      address: data.address,
      symbol: data.symbol,
      name: data.name,
      decimals: parseInt(data.decimals),
      price: data.price ? parseFloat(data.price) : undefined,
      liquidity: data.liquidity ? parseFloat(data.liquidity) : undefined
    };
  }

  /**
   * Validate trading pairs response
   */
  private validateTradingPairs(data: any): TradingPair[] {
    if (!Array.isArray(data)) {
      throw new Error('Invalid trading pairs response');
    }

    return data.map((pair: any) => {
      if (!pair.token0 || !pair.token1) {
        throw new Error('Invalid trading pair format');
      }

      return {
        token0: this.validateTokenInfo(pair.token0),
        token1: this.validateTokenInfo(pair.token1),
        reserve0: pair.reserve0 || '0',
        reserve1: pair.reserve1 || '0',
        price: parseFloat(pair.price || '0'),
        liquidity: pair.liquidity || '0'
      };
    });
  }

  /**
   * Validate market data response
   */
  private validateMarketData(data: any): MarketData {
    if (!data || typeof data !== 'object') {
      throw new Error('Invalid market data response');
    }

    const requiredFields = ['timestamp', 'price', 'volume'];
    for (const field of requiredFields) {
      if (!(field in data)) {
        throw new Error(`Missing required field: ${field}`);
      }
    }

    return {
      timestamp: parseInt(data.timestamp),
      price: parseFloat(data.price),
      volume: parseFloat(data.volume),
      high24h: parseFloat(data.high24h || '0'),
      low24h: parseFloat(data.low24h || '0'),
      change24h: parseFloat(data.change24h || '0')
    };
  }
}

// Export singleton instance
export const galaSwapClient = GalaSwapClient.getInstance();
