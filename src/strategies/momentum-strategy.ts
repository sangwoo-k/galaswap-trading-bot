import { BaseTradingStrategy } from './base-strategy';
import { galaSwapClient } from '../api/galaswap-client';
import { appLogger } from '../utils/logger';
import { MarketData, TokenInfo } from '../types';

export interface MomentumParameters {
  lookbackPeriod: number; // Number of periods to look back for momentum calculation
  momentumThreshold: number; // Minimum momentum to trigger a trade
  volumeThreshold: number; // Minimum volume to consider a trade
  maxPositionSize: number; // Maximum position size
  stopLossPercentage: number; // Stop loss percentage
  takeProfitPercentage: number; // Take profit percentage
  cooldownPeriod: number; // Cooldown period between trades (ms)
  minPriceChange: number; // Minimum price change to consider momentum
}

export class MomentumStrategy extends BaseTradingStrategy {
  private parameters: MomentumParameters;
  private priceHistory: Map<string, number[]> = new Map();
  private volumeHistory: Map<string, number[]> = new Map();
  private lastTradeTime: number = 0;
  private readonly MAX_HISTORY_LENGTH = 100;

  constructor(parameters: Partial<MomentumParameters> = {}) {
    super('Momentum Strategy', 'high', parameters);
    
    this.parameters = {
      lookbackPeriod: 20,
      momentumThreshold: 2.0, // 2% momentum threshold
      volumeThreshold: 10000, // $10,000 minimum volume
      maxPositionSize: 500,
      stopLossPercentage: 5.0,
      takeProfitPercentage: 10.0,
      cooldownPeriod: 300000, // 5 minutes cooldown
      minPriceChange: 1.0, // 1% minimum price change
      ...parameters
    };
  }

  public async initialize(): Promise<void> {
    this.logEvent('Initializing momentum strategy', this.parameters);
    this.isRunning = true;
  }

  public async execute(): Promise<void> {
    if (!this.shouldRun()) return;

    try {
      // Check cooldown period
      const now = Date.now();
      if (now - this.lastTradeTime < this.parameters.cooldownPeriod) {
        return;
      }

      // Get trading pairs
      const pairs = await galaSwapClient.getTradingPairs();
      
      // Analyze momentum for each pair
      for (const pair of pairs) {
        await this.analyzeMomentum(pair.token0, pair.token1);
      }

      // Check existing positions for stop loss/take profit
      await this.manageExistingPositions();

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'momentum_execution',
        strategy: this.name
      });
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.logEvent('Momentum strategy stopped');
  }

  private async analyzeMomentum(token0: TokenInfo, token1: TokenInfo): Promise<void> {
    try {
      // Get current market data
      const marketData = await galaSwapClient.getMarketData(token0.address, token1.address);
      
      // Update price and volume history
      this.updateHistory(token0.address, marketData.price, marketData.volume);
      this.updateHistory(token1.address, 1 / marketData.price, marketData.volume);

      // Calculate momentum indicators
      const momentum0 = this.calculateMomentum(token0.address);
      const momentum1 = this.calculateMomentum(token1.address);

      // Check for trading opportunities
      if (momentum0 > this.parameters.momentumThreshold) {
        await this.considerLongPosition(token0, token1, momentum0);
      } else if (momentum0 < -this.parameters.momentumThreshold) {
        await this.considerShortPosition(token0, token1, Math.abs(momentum0));
      }

      if (momentum1 > this.parameters.momentumThreshold) {
        await this.considerLongPosition(token1, token0, momentum1);
      } else if (momentum1 < -this.parameters.momentumThreshold) {
        await this.considerShortPosition(token1, token0, Math.abs(momentum1));
      }

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'analyze_momentum',
        token0: token0.symbol,
        token1: token1.symbol
      });
    }
  }

  private updateHistory(tokenAddress: string, price: number, volume: number): void {
    // Update price history
    if (!this.priceHistory.has(tokenAddress)) {
      this.priceHistory.set(tokenAddress, []);
    }
    
    const priceHistory = this.priceHistory.get(tokenAddress)!;
    priceHistory.push(price);
    
    if (priceHistory.length > this.MAX_HISTORY_LENGTH) {
      priceHistory.shift();
    }

    // Update volume history
    if (!this.volumeHistory.has(tokenAddress)) {
      this.volumeHistory.set(tokenAddress, []);
    }
    
    const volumeHistory = this.volumeHistory.get(tokenAddress)!;
    volumeHistory.push(volume);
    
    if (volumeHistory.length > this.MAX_HISTORY_LENGTH) {
      volumeHistory.shift();
    }
  }

  private calculateMomentum(tokenAddress: string): number {
    const priceHistory = this.priceHistory.get(tokenAddress);
    if (!priceHistory || priceHistory.length < this.parameters.lookbackPeriod) {
      return 0;
    }

    const recentPrices = priceHistory.slice(-this.parameters.lookbackPeriod);
    const oldestPrice = recentPrices[0];
    const newestPrice = recentPrices[recentPrices.length - 1];

    return ((newestPrice - oldestPrice) / oldestPrice) * 100;
  }

  private async considerLongPosition(
    tokenIn: TokenInfo,
    tokenOut: TokenInfo,
    momentum: number
  ): Promise<void> {
    try {
      // Check if we already have a position in this pair
      const existingPosition = this.getExistingPosition(tokenIn.address, tokenOut.address);
      if (existingPosition) {
        return; // Already have a position
      }

      // Check volume threshold
      const volumeHistory = this.volumeHistory.get(tokenIn.address);
      if (!volumeHistory || volumeHistory.length < 5) {
        return;
      }

      const avgVolume = volumeHistory.slice(-5).reduce((sum, vol) => sum + vol, 0) / 5;
      if (avgVolume < this.parameters.volumeThreshold) {
        return;
      }

      // Calculate position size based on momentum strength
      const positionSize = Math.min(
        this.parameters.maxPositionSize,
        (momentum / this.parameters.momentumThreshold) * 100
      );

      // Get quote
      const quote = await galaSwapClient.getQuote(
        tokenIn.address,
        tokenOut.address,
        positionSize.toString()
      );

      // Check slippage
      if (quote.priceImpact > 2.0) { // 2% max slippage
        return;
      }

      // Execute trade
      const result = await this.executeTrade(
        tokenIn.address,
        tokenOut.address,
        positionSize.toString(),
        quote.minimumReceived,
        Date.now() + 300000
      );

      if (result.success) {
        // Create position
        const position = this.createPosition(
          tokenIn.address,
          tokenOut.address,
          positionSize.toString(),
          parseFloat(quote.amountOut) / positionSize,
          this.parameters.stopLossPercentage,
          this.parameters.takeProfitPercentage
        );

        this.lastTradeTime = Date.now();

        this.logEvent('Long position opened', {
          tokenIn: tokenIn.symbol,
          tokenOut: tokenOut.symbol,
          amount: positionSize,
          momentum,
          transactionHash: result.transactionHash
        });
      }

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'consider_long_position',
        tokenIn: tokenIn.symbol,
        tokenOut: tokenOut.symbol,
        momentum
      });
    }
  }

  private async considerShortPosition(
    tokenIn: TokenInfo,
    tokenOut: TokenInfo,
    momentum: number
  ): Promise<void> {
    try {
      // Check if we already have a position in this pair
      const existingPosition = this.getExistingPosition(tokenOut.address, tokenIn.address);
      if (existingPosition) {
        return; // Already have a position
      }

      // Check volume threshold
      const volumeHistory = this.volumeHistory.get(tokenIn.address);
      if (!volumeHistory || volumeHistory.length < 5) {
        return;
      }

      const avgVolume = volumeHistory.slice(-5).reduce((sum, vol) => sum + vol, 0) / 5;
      if (avgVolume < this.parameters.volumeThreshold) {
        return;
      }

      // Calculate position size based on momentum strength
      const positionSize = Math.min(
        this.parameters.maxPositionSize,
        (momentum / this.parameters.momentumThreshold) * 100
      );

      // Get quote
      const quote = await galaSwapClient.getQuote(
        tokenIn.address,
        tokenOut.address,
        positionSize.toString()
      );

      // Check slippage
      if (quote.priceImpact > 2.0) { // 2% max slippage
        return;
      }

      // Execute trade
      const result = await this.executeTrade(
        tokenIn.address,
        tokenOut.address,
        positionSize.toString(),
        quote.minimumReceived,
        Date.now() + 300000
      );

      if (result.success) {
        // Create position
        const position = this.createPosition(
          tokenIn.address,
          tokenOut.address,
          positionSize.toString(),
          parseFloat(quote.amountOut) / positionSize,
          this.parameters.stopLossPercentage,
          this.parameters.takeProfitPercentage
        );

        this.lastTradeTime = Date.now();

        this.logEvent('Short position opened', {
          tokenIn: tokenIn.symbol,
          tokenOut: tokenOut.symbol,
          amount: positionSize,
          momentum,
          transactionHash: result.transactionHash
        });
      }

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'consider_short_position',
        tokenIn: tokenIn.symbol,
        tokenOut: tokenOut.symbol,
        momentum
      });
    }
  }

  private getExistingPosition(tokenIn: string, tokenOut: string): any {
    return Array.from(this.positions.values()).find(
      pos => pos.tokenIn === tokenIn && pos.tokenOut === tokenOut && pos.status === 'open'
    );
  }

  private async manageExistingPositions(): Promise<void> {
    const openPositions = Array.from(this.positions.values()).filter(pos => pos.status === 'open');
    
    for (const position of openPositions) {
      try {
        // Get current market data
        const marketData = await galaSwapClient.getMarketData(position.tokenIn, position.tokenOut);
        
        // Update position with current price
        this.updatePosition(position.id, { currentPrice: marketData.price });

      } catch (error) {
        appLogger.logError(error as Error, {
          operation: 'manage_existing_positions',
          positionId: position.id
        });
      }
    }
  }
}
