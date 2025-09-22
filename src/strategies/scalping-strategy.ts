import { BaseTradingStrategy } from './base-strategy';
import { galaSwapClient } from '../api/galaswap-client';
import { appLogger } from '../utils/logger';
import { TokenInfo } from '../types';

export interface ScalpingParameters {
  targetToken: string;
  quoteToken: string;
  quickProfitTarget: number; // percentage for quick profit
  maxLossPerTrade: number; // percentage max loss
  tradeSize: number; // amount per trade
  maxTradesPerHour: number;
  volatilityThreshold: number; // minimum volatility to trade
  volumeThreshold: number; // minimum volume to trade
  spreadThreshold: number; // maximum spread to trade
  cooldownPeriod: number; // seconds between trades
}

export class ScalpingStrategy extends BaseTradingStrategy {
  private parameters: ScalpingParameters;
  private lastTradeTime: number = 0;
  private tradesThisHour: number = 0;
  private currentHour: number = 0;
  private totalScalpingProfit: number = 0;
  private totalScalpingTrades: number = 0;
  private priceHistory: number[] = [];

  constructor(parameters: Partial<ScalpingParameters> = {}) {
    super('Scalping Strategy', 'high', parameters);
    
    this.parameters = {
      targetToken: 'GALA',
      quoteToken: 'ETH',
      quickProfitTarget: 0.5, // 0.5% quick profit
      maxLossPerTrade: 0.3, // 0.3% max loss
      tradeSize: 25,
      maxTradesPerHour: 10,
      volatilityThreshold: 1, // 1% minimum volatility
      volumeThreshold: 5000, // $5000 minimum volume
      spreadThreshold: 0.2, // 0.2% maximum spread
      cooldownPeriod: 30, // 30 seconds between trades
      ...parameters
    };
  }

  public async initialize(): Promise<void> {
    this.logEvent('Initializing Scalping strategy', this.parameters);
    this.isRunning = true;
  }

  public async execute(): Promise<void> {
    if (!this.shouldRun()) return;

    try {
      const now = Date.now();
      const currentHour = Math.floor(now / (1000 * 60 * 60));

      // Reset hourly trade counter
      if (currentHour !== this.currentHour) {
        this.tradesThisHour = 0;
        this.currentHour = currentHour;
      }

      // Check if we can trade
      if (!this.canTrade(now)) {
        return;
      }

      // Get market data
      const marketData = await galaSwapClient.getMarketData(
        this.parameters.targetToken,
        this.parameters.quoteToken
      );

      // Update price history
      this.updatePriceHistory(marketData.price);

      // Check for scalping opportunities
      await this.checkScalpingOpportunities(marketData);

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'scalping_execution',
        strategy: this.name
      });
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.logEvent('Scalping strategy stopped');
  }

  private canTrade(now: number): boolean {
    // Check cooldown period
    if (now - this.lastTradeTime < this.parameters.cooldownPeriod * 1000) {
      return false;
    }

    // Check hourly trade limit
    if (this.tradesThisHour >= this.parameters.maxTradesPerHour) {
      return false;
    }

    return true;
  }

  private updatePriceHistory(price: number): void {
    this.priceHistory.push(price);
    
    // Keep only last 100 prices
    if (this.priceHistory.length > 100) {
      this.priceHistory.shift();
    }
  }

  private async checkScalpingOpportunities(marketData: any): Promise<void> {
    // Check if market conditions are suitable for scalping
    if (!this.isSuitableForScalping(marketData)) {
      return;
    }

    // Look for quick price movements
    const priceMovement = this.detectPriceMovement();
    
    if (priceMovement.direction === 'up' && priceMovement.strength > this.parameters.volatilityThreshold) {
      await this.executeScalpingTrade('buy', marketData);
    } else if (priceMovement.direction === 'down' && priceMovement.strength > this.parameters.volatilityThreshold) {
      await this.executeScalpingTrade('sell', marketData);
    }
  }

  private isSuitableForScalping(marketData: any): boolean {
    // Check volatility
    if (Math.abs(marketData.change24h) < this.parameters.volatilityThreshold) {
      return false;
    }

    // Check volume
    if (marketData.volume < this.parameters.volumeThreshold) {
      return false;
    }

    // Check spread (simplified)
    const spread = Math.abs(marketData.high24h - marketData.low24h) / marketData.price * 100;
    if (spread > this.parameters.spreadThreshold) {
      return false;
    }

    return true;
  }

  private detectPriceMovement(): { direction: 'up' | 'down' | 'sideways'; strength: number } {
    if (this.priceHistory.length < 10) {
      return { direction: 'sideways', strength: 0 };
    }

    const recent = this.priceHistory.slice(-5);
    const older = this.priceHistory.slice(-10, -5);
    
    const recentAvg = recent.reduce((sum, price) => sum + price, 0) / recent.length;
    const olderAvg = older.reduce((sum, price) => sum + price, 0) / older.length;
    
    const change = (recentAvg - olderAvg) / olderAvg * 100;
    
    if (change > 0.1) {
      return { direction: 'up', strength: Math.abs(change) };
    } else if (change < -0.1) {
      return { direction: 'down', strength: Math.abs(change) };
    } else {
      return { direction: 'sideways', strength: Math.abs(change) };
    }
  }

  private async executeScalpingTrade(direction: 'buy' | 'sell', marketData: any): Promise<void> {
    try {
      let result;
      
      if (direction === 'buy') {
        result = await this.executeTrade(
          this.parameters.quoteToken,
          this.parameters.targetToken,
          this.parameters.tradeSize.toString(),
          '0',
          Date.now() + 60000 // 1 minute deadline for scalping
        );
      } else {
        result = await this.executeTrade(
          this.parameters.targetToken,
          this.parameters.quoteToken,
          this.parameters.tradeSize.toString(),
          '0',
          Date.now() + 60000
        );
      }

      if (result.success) {
        this.lastTradeTime = Date.now();
        this.tradesThisHour++;
        this.totalScalpingTrades++;

        // Set quick profit target and stop loss
        const position = this.createPosition(
          direction === 'buy' ? this.parameters.quoteToken : this.parameters.targetToken,
          direction === 'buy' ? this.parameters.targetToken : this.parameters.quoteToken,
          this.parameters.tradeSize.toString(),
          marketData.price,
          this.parameters.maxLossPerTrade,
          this.parameters.quickProfitTarget
        );

        this.logEvent('Scalping trade executed', {
          direction,
          amount: this.parameters.tradeSize,
          price: marketData.price,
          tradesThisHour: this.tradesThisHour,
          totalTrades: this.totalScalpingTrades
        });

        // Monitor for quick exit
        setTimeout(() => {
          this.checkQuickExit(position.id);
        }, 30000); // Check after 30 seconds
      }

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'execute_scalping_trade',
        direction,
        marketData
      });
    }
  }

  private async checkQuickExit(positionId: string): Promise<void> {
    const position = this.positions.get(positionId);
    if (!position || position.status !== 'open') {
      return;
    }

    try {
      const marketData = await galaSwapClient.getMarketData(
        position.tokenIn,
        position.tokenOut
      );

      const currentPrice = marketData.price;
      const entryPrice = position.entryPrice;
      const priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;

      // Quick profit or loss exit
      if (priceChange >= this.parameters.quickProfitTarget || 
          priceChange <= -this.parameters.maxLossPerTrade) {
        
        this.closePosition(positionId, priceChange > 0 ? 'closed' : 'stopped');
        
        const profit = priceChange > 0 ? 
          (currentPrice - entryPrice) * parseFloat(position.amountIn) : 0;
        this.totalScalpingProfit += profit;

        this.logEvent('Scalping quick exit', {
          positionId,
          priceChange,
          profit,
          totalProfit: this.totalScalpingProfit
        });
      }

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'check_quick_exit',
        positionId
      });
    }
  }

  public getScalpingMetrics(): {
    totalTrades: number;
    totalProfit: number;
    tradesThisHour: number;
    averageTradeSize: number;
    winRate: number;
  } {
    const positions = this.getPositions();
    const closedPositions = positions.filter(pos => pos.status === 'closed');
    const profitableTrades = closedPositions.filter(pos => 
      parseFloat(pos.amountOut) > parseFloat(pos.amountIn)
    );

    return {
      totalTrades: this.totalScalpingTrades,
      totalProfit: this.totalScalpingProfit,
      tradesThisHour: this.tradesThisHour,
      averageTradeSize: this.parameters.tradeSize,
      winRate: closedPositions.length > 0 ? 
        profitableTrades.length / closedPositions.length : 0
    };
  }
}
