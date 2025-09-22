import { BaseTradingStrategy } from './base-strategy';
import { galaSwapClient } from '../api/galaswap-client';
import { appLogger } from '../utils/logger';
import { TokenInfo } from '../types';

export interface GridParameters {
  baseToken: string;
  quoteToken: string;
  gridSpacing: number; // percentage between grid levels
  gridLevels: number; // number of grid levels
  baseAmount: number; // amount per grid level
  priceRange: number; // percentage range around current price
  maxPositionSize: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  rebalanceThreshold: number; // percentage to trigger rebalancing
}

export class GridStrategy extends BaseTradingStrategy {
  private parameters: GridParameters;
  private gridLevels: Array<{
    price: number;
    amount: number;
    type: 'buy' | 'sell';
    filled: boolean;
  }> = [];
  private currentPrice: number = 0;
  private totalProfit: number = 0;
  private totalTrades: number = 0;

  constructor(parameters: Partial<GridParameters> = {}) {
    super('Grid Trading Strategy', 'medium', parameters);
    
    this.parameters = {
      baseToken: 'GALA',
      quoteToken: 'ETH',
      gridSpacing: 2, // 2% between levels
      gridLevels: 10,
      baseAmount: 50,
      priceRange: 20, // 20% range
      maxPositionSize: 500,
      stopLossPercentage: 10,
      takeProfitPercentage: 15,
      rebalanceThreshold: 5,
      ...parameters
    };
  }

  public async initialize(): Promise<void> {
    this.logEvent('Initializing Grid strategy', this.parameters);
    this.isRunning = true;
    await this.setupGrid();
  }

  public async execute(): Promise<void> {
    if (!this.shouldRun()) return;

    try {
      // Get current market price
      const marketData = await galaSwapClient.getMarketData(
        this.parameters.baseToken,
        this.parameters.quoteToken
      );
      
      this.currentPrice = marketData.price;

      // Check for grid level hits
      await this.checkGridLevels();

      // Rebalance grid if needed
      await this.rebalanceGrid();

      // Monitor positions
      await this.monitorPositions();

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'grid_execution',
        strategy: this.name
      });
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.logEvent('Grid strategy stopped');
  }

  private async setupGrid(): Promise<void> {
    try {
      const marketData = await galaSwapClient.getMarketData(
        this.parameters.baseToken,
        this.parameters.quoteToken
      );
      
      this.currentPrice = marketData.price;
      this.gridLevels = [];

      // Create buy levels (below current price)
      for (let i = 1; i <= this.parameters.gridLevels / 2; i++) {
        const price = this.currentPrice * (1 - (this.parameters.gridSpacing * i) / 100);
        this.gridLevels.push({
          price,
          amount: this.parameters.baseAmount,
          type: 'buy',
          filled: false
        });
      }

      // Create sell levels (above current price)
      for (let i = 1; i <= this.parameters.gridLevels / 2; i++) {
        const price = this.currentPrice * (1 + (this.parameters.gridSpacing * i) / 100);
        this.gridLevels.push({
          price,
          amount: this.parameters.baseAmount,
          type: 'sell',
          filled: false
        });
      }

      this.logEvent('Grid setup completed', {
        currentPrice: this.currentPrice,
        gridLevels: this.gridLevels.length,
        priceRange: this.parameters.priceRange
      });

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'setup_grid',
        strategy: this.name
      });
    }
  }

  private async checkGridLevels(): Promise<void> {
    for (const level of this.gridLevels) {
      if (level.filled) continue;

      const priceDifference = Math.abs(this.currentPrice - level.price) / level.price * 100;
      
      if (priceDifference <= 0.5) { // 0.5% tolerance
        await this.executeGridTrade(level);
      }
    }
  }

  private async executeGridTrade(level: any): Promise<void> {
    try {
      let result;
      
      if (level.type === 'buy') {
        // Buy at this level
        result = await this.executeTrade(
          this.parameters.quoteToken,
          this.parameters.baseToken,
          level.amount.toString(),
          '0',
          Date.now() + 300000
        );
      } else {
        // Sell at this level
        result = await this.executeTrade(
          this.parameters.baseToken,
          this.parameters.quoteToken,
          level.amount.toString(),
          '0',
          Date.now() + 300000
        );
      }

      if (result.success) {
        level.filled = true;
        this.totalTrades++;
        
        // Calculate profit
        const profit = level.type === 'sell' ? 
          (level.price - this.currentPrice) * level.amount : 0;
        this.totalProfit += profit;

        this.logEvent('Grid trade executed', {
          type: level.type,
          price: level.price,
          amount: level.amount,
          profit: profit,
          totalTrades: this.totalTrades,
          totalProfit: this.totalProfit
        });
      }

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'execute_grid_trade',
        level: level
      });
    }
  }

  private async rebalanceGrid(): Promise<void> {
    const priceChange = Math.abs(this.currentPrice - this.gridLevels[0].price) / this.gridLevels[0].price * 100;
    
    if (priceChange > this.parameters.rebalanceThreshold) {
      this.logEvent('Rebalancing grid due to price movement', {
        priceChange: priceChange,
        currentPrice: this.currentPrice
      });
      
      await this.setupGrid();
    }
  }

  private async monitorPositions(): Promise<void> {
    const positions = this.getPositions();
    
    for (const position of positions) {
      if (position.status === 'open') {
        const currentPrice = position.currentPrice;
        const entryPrice = position.entryPrice;
        const priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;

        if (priceChange <= -this.parameters.stopLossPercentage) {
          this.closePosition(position.id, 'stopped');
          this.logEvent('Grid position stopped out', {
            positionId: position.id,
            priceChange: priceChange
          });
        } else if (priceChange >= this.parameters.takeProfitPercentage) {
          this.closePosition(position.id, 'closed');
          this.logEvent('Grid position took profit', {
            positionId: position.id,
            priceChange: priceChange
          });
        }
      }
    }
  }

  public getGridMetrics(): {
    totalTrades: number;
    totalProfit: number;
    activeLevels: number;
    currentPrice: number;
    gridRange: { min: number; max: number };
  } {
    const activeLevels = this.gridLevels.filter(level => !level.filled).length;
    const prices = this.gridLevels.map(level => level.price);
    
    return {
      totalTrades: this.totalTrades,
      totalProfit: this.totalProfit,
      activeLevels,
      currentPrice: this.currentPrice,
      gridRange: {
        min: Math.min(...prices),
        max: Math.max(...prices)
      }
    };
  }
}
