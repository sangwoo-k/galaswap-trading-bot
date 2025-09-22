import { BaseTradingStrategy } from './base-strategy';
import { galaSwapClient } from '../api/galaswap-client';
import { appLogger } from '../utils/logger';
import { TokenInfo } from '../types';

export interface DCAParameters {
  targetToken: string;
  investmentAmount: number;
  frequency: number; // hours between purchases
  maxInvestments: number;
  priceDropThreshold: number; // percentage drop to trigger additional purchase
  maxPositionSize: number;
  stopLossPercentage: number;
  takeProfitPercentage: number;
  volatilityThreshold: number; // high volatility = skip purchase
}

export class DCAStrategy extends BaseTradingStrategy {
  private parameters: DCAParameters;
  private lastPurchaseTime: number = 0;
  private purchaseCount: number = 0;
  private averagePrice: number = 0;
  private totalInvested: number = 0;
  private totalTokens: number = 0;

  constructor(parameters: Partial<DCAParameters> = {}) {
    super('Dollar Cost Averaging Strategy', 'low', parameters);
    
    this.parameters = {
      targetToken: 'GALA',
      investmentAmount: 100,
      frequency: 24, // 24 hours
      maxInvestments: 30,
      priceDropThreshold: 10, // 10% drop triggers additional purchase
      maxPositionSize: 1000,
      stopLossPercentage: 15,
      takeProfitPercentage: 25,
      volatilityThreshold: 20, // 20% volatility = skip
      ...parameters
    };
  }

  public async initialize(): Promise<void> {
    this.logEvent('Initializing DCA strategy', this.parameters);
    this.isRunning = true;
  }

  public async execute(): Promise<void> {
    if (!this.shouldRun()) return;

    try {
      const now = Date.now();
      const timeSinceLastPurchase = (now - this.lastPurchaseTime) / (1000 * 60 * 60); // hours

      // Check if it's time for regular DCA purchase
      if (timeSinceLastPurchase >= this.parameters.frequency && 
          this.purchaseCount < this.parameters.maxInvestments) {
        await this.executeDCAPurchase();
      }

      // Check for price drop opportunity
      await this.checkPriceDropOpportunity();

      // Monitor existing positions
      await this.monitorPositions();

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'dca_execution',
        strategy: this.name
      });
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.logEvent('DCA strategy stopped');
  }

  private async executeDCAPurchase(): Promise<void> {
    try {
      // Get current market data
      const marketData = await galaSwapClient.getMarketData('ETH', this.parameters.targetToken);
      
      // Check volatility
      if (this.isHighVolatility(marketData)) {
        this.logEvent('Skipping DCA purchase due to high volatility', {
          volatility: marketData.change24h
        });
        return;
      }

      // Calculate position size based on remaining investments
      const remainingInvestments = this.parameters.maxInvestments - this.purchaseCount;
      const positionSize = Math.min(
        this.parameters.investmentAmount,
        this.parameters.maxPositionSize / remainingInvestments
      );

      // Execute purchase
      const result = await this.executeTrade(
        'ETH',
        this.parameters.targetToken,
        positionSize.toString(),
        '0', // Will be calculated based on slippage
        Date.now() + 300000
      );

      if (result.success) {
        this.updateDCAMetrics(positionSize, marketData.price);
        this.purchaseCount++;
        this.lastPurchaseTime = Date.now();

        this.logEvent('DCA purchase executed', {
          amount: positionSize,
          price: marketData.price,
          purchaseCount: this.purchaseCount,
          averagePrice: this.averagePrice
        });
      }

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'execute_dca_purchase',
        strategy: this.name
      });
    }
  }

  private async checkPriceDropOpportunity(): Promise<void> {
    try {
      if (this.purchaseCount >= this.parameters.maxInvestments) return;

      const marketData = await galaSwapClient.getMarketData('ETH', this.parameters.targetToken);
      const priceDrop = ((this.averagePrice - marketData.price) / this.averagePrice) * 100;

      if (priceDrop >= this.parameters.priceDropThreshold) {
        // Execute additional purchase on significant price drop
        const additionalAmount = this.parameters.investmentAmount * 1.5; // 50% more on drops

        const result = await this.executeTrade(
          'ETH',
          this.parameters.targetToken,
          additionalAmount.toString(),
          '0',
          Date.now() + 300000
        );

        if (result.success) {
          this.updateDCAMetrics(additionalAmount, marketData.price);
          this.purchaseCount++;

          this.logEvent('Additional DCA purchase on price drop', {
            amount: additionalAmount,
            price: marketData.price,
            priceDrop: priceDrop,
            averagePrice: this.averagePrice
          });
        }
      }

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'check_price_drop_opportunity',
        strategy: this.name
      });
    }
  }

  private updateDCAMetrics(amount: number, price: number): void {
    this.totalInvested += amount;
    this.totalTokens += amount / price;
    this.averagePrice = this.totalInvested / this.totalTokens;
  }

  private isHighVolatility(marketData: any): boolean {
    return Math.abs(marketData.change24h) > this.parameters.volatilityThreshold;
  }

  private async monitorPositions(): Promise<void> {
    const positions = this.getPositions();
    
    for (const position of positions) {
      if (position.status === 'open') {
        // Check for stop loss or take profit
        const currentPrice = position.currentPrice;
        const entryPrice = position.entryPrice;
        const priceChange = ((currentPrice - entryPrice) / entryPrice) * 100;

        if (priceChange <= -this.parameters.stopLossPercentage) {
          this.closePosition(position.id, 'stopped');
          this.logEvent('DCA position stopped out', {
            positionId: position.id,
            priceChange: priceChange
          });
        } else if (priceChange >= this.parameters.takeProfitPercentage) {
          this.closePosition(position.id, 'closed');
          this.logEvent('DCA position took profit', {
            positionId: position.id,
            priceChange: priceChange
          });
        }
      }
    }
  }

  public getDCAMetrics(): {
    totalInvested: number;
    totalTokens: number;
    averagePrice: number;
    purchaseCount: number;
    remainingInvestments: number;
  } {
    return {
      totalInvested: this.totalInvested,
      totalTokens: this.totalTokens,
      averagePrice: this.averagePrice,
      purchaseCount: this.purchaseCount,
      remainingInvestments: this.parameters.maxInvestments - this.purchaseCount
    };
  }
}
