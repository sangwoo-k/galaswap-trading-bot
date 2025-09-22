import { BaseTradingStrategy } from './base-strategy';
import { feeCalculator } from '../utils/fee-calculator';
import { galaSwapClient } from '../api/galaswap-client';
import { appLogger } from '../utils/logger';
import { TokenInfo } from '../types';

export interface FeeAwareParameters {
  targetToken: string;
  quoteToken: string;
  minProfitMargin: number; // minimum profit margin above GALA fee
  maxPositionSize: number;
  volatilityThreshold: number;
  volumeThreshold: number;
  cooldownPeriod: number;
  maxTradesPerDay: number;
}

export class FeeAwareStrategy extends BaseTradingStrategy {
  private parameters: FeeAwareParameters;
  private lastTradeTime: number = 0;
  private tradesToday: number = 0;
  private lastTradeDate: string = '';
  private totalFeesPaid: number = 0;
  private totalNetProfit: number = 0;

  constructor(parameters: Partial<FeeAwareParameters> = {}) {
    super('Fee-Aware Strategy', 'low', parameters);
    
    this.parameters = {
      targetToken: 'GALA',
      quoteToken: 'ETH',
      minProfitMargin: 1.2, // 20% profit margin above GALA fee
      maxPositionSize: 500,
      volatilityThreshold: 5, // 5% volatility threshold
      volumeThreshold: 10000, // $10,000 minimum volume
      cooldownPeriod: 300000, // 5 minutes cooldown
      maxTradesPerDay: 10,
      ...parameters
    };
  }

  public async initialize(): Promise<void> {
    this.logEvent('Initializing Fee-Aware strategy', this.parameters);
    this.isRunning = true;
    this.resetDailyCounters();
  }

  public async execute(): Promise<void> {
    if (!this.shouldRun()) return;

    try {
      // Reset daily counters if new day
      this.resetDailyCounters();

      // Check if we can trade
      if (!this.canTrade()) {
        return;
      }

      // Get market data
      const marketData = await galaSwapClient.getMarketData(
        this.parameters.targetToken,
        this.parameters.quoteToken
      );

      // Check market conditions
      if (!this.isMarketSuitable(marketData)) {
        return;
      }

      // Look for profitable opportunities
      await this.findProfitableOpportunities(marketData);

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'fee_aware_execution',
        strategy: this.name
      });
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.logEvent('Fee-Aware strategy stopped');
  }

  private resetDailyCounters(): void {
    const today = new Date().toDateString();
    if (today !== this.lastTradeDate) {
      this.tradesToday = 0;
      this.lastTradeDate = today;
    }
  }

  private canTrade(): boolean {
    // Check cooldown period
    const now = Date.now();
    if (now - this.lastTradeTime < this.parameters.cooldownPeriod) {
      return false;
    }

    // Check daily trade limit
    if (this.tradesToday >= this.parameters.maxTradesPerDay) {
      this.logEvent('Daily trade limit reached', {
        tradesToday: this.tradesToday,
        maxTradesPerDay: this.parameters.maxTradesPerDay
      });
      return false;
    }

    return true;
  }

  private isMarketSuitable(marketData: any): boolean {
    // Check volatility
    if (Math.abs(marketData.change24h) > this.parameters.volatilityThreshold) {
      this.logEvent('Market volatility too high', {
        volatility: marketData.change24h,
        threshold: this.parameters.volatilityThreshold
      });
      return false;
    }

    // Check volume
    if (marketData.volume < this.parameters.volumeThreshold) {
      this.logEvent('Market volume too low', {
        volume: marketData.volume,
        threshold: this.parameters.volumeThreshold
      });
      return false;
    }

    return true;
  }

  private async findProfitableOpportunities(marketData: any): Promise<void> {
    try {
      // Calculate minimum amount for profitable trade
      const minimumAmount = await feeCalculator.calculateMinimumAmount(
        this.parameters.quoteToken,
        this.parameters.targetToken,
        marketData.price
      );

      // Check if minimum amount is within our limits
      if (minimumAmount.minimumAmountUSD > this.parameters.maxPositionSize) {
        this.logEvent('Minimum amount exceeds position limit', {
          minimumAmount: minimumAmount.minimumAmountUSD,
          maxPositionSize: this.parameters.maxPositionSize
        });
        return;
      }

      // Calculate position size (use minimum amount + margin)
      const positionSize = Math.min(
        minimumAmount.minimumAmount * this.parameters.minProfitMargin,
        this.parameters.maxPositionSize
      );

      // Get quote for the trade
      const quote = await galaSwapClient.getQuote(
        this.parameters.quoteToken,
        this.parameters.targetToken,
        positionSize.toString()
      );

      // Validate transaction profitability
      const validation = await feeCalculator.validateTransaction(
        this.parameters.quoteToken,
        this.parameters.targetToken,
        positionSize.toString(),
        quote.amountOut,
        marketData.price
      );

      if (!validation.isValid) {
        this.logEvent('Transaction not profitable', {
          reason: validation.reason,
          feeCalculation: validation.feeCalculation
        });
        return;
      }

      // Execute the profitable trade
      await this.executeProfitableTrade(
        positionSize,
        quote.amountOut,
        marketData.price,
        validation.feeCalculation
      );

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'find_profitable_opportunities',
        marketData
      });
    }
  }

  private async executeProfitableTrade(
    amountIn: number,
    expectedAmountOut: string,
    currentPrice: number,
    feeCalculation: any
  ): Promise<void> {
    try {
      const result = await this.executeTrade(
        this.parameters.quoteToken,
        this.parameters.targetToken,
        amountIn.toString(),
        expectedAmountOut,
        Date.now() + 300000
      );

      if (result.success) {
        // Update counters
        this.lastTradeTime = Date.now();
        this.tradesToday++;
        this.totalFeesPaid += feeCalculation.galaFeeInUSD;
        this.totalNetProfit += feeCalculation.netProfit;

        // Create position with fee-aware stop loss
        const stopLossPercentage = Math.max(
          feeCalculation.minimumProfitPercentage * 1.5, // 1.5x minimum profit as stop loss
          2.0 // Minimum 2% stop loss
        );

        const takeProfitPercentage = feeCalculation.minimumProfitPercentage * 2; // 2x minimum profit as take profit

        const position = this.createPosition(
          this.parameters.quoteToken,
          this.parameters.targetToken,
          amountIn.toString(),
          currentPrice,
          stopLossPercentage,
          takeProfitPercentage
        );

        this.logEvent('Profitable trade executed', {
          amountIn,
          expectedAmountOut,
          galaFee: feeCalculation.galaFee,
          galaFeeInUSD: feeCalculation.galaFeeInUSD,
          netProfit: feeCalculation.netProfit,
          netProfitPercentage: feeCalculation.netProfitPercentage,
          transactionHash: result.transactionHash,
          positionId: position.id
        });

        // Record fee payment
        this.recordFeePayment(feeCalculation);

      } else {
        this.logEvent('Trade execution failed', {
          amountIn,
          error: result.error
        });
      }

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'execute_profitable_trade',
        amountIn,
        expectedAmountOut,
        currentPrice
      });
    }
  }

  private recordFeePayment(feeCalculation: any): void {
    // Log fee payment for accounting
    appLogger.logSystemEvent('GALA fee paid', {
      strategy: this.name,
      galaFee: feeCalculation.galaFee,
      galaFeeInUSD: feeCalculation.galaFeeInUSD,
      netProfit: feeCalculation.netProfit,
      timestamp: new Date().toISOString()
    });
  }

  public getFeeAwareMetrics(): {
    totalFeesPaid: number;
    totalNetProfit: number;
    tradesToday: number;
    maxTradesPerDay: number;
    averageProfitPerTrade: number;
    feeCoverageRatio: number;
  } {
    const averageProfitPerTrade = this.tradesToday > 0 ? 
      this.totalNetProfit / this.tradesToday : 0;
    
    const feeCoverageRatio = this.totalFeesPaid > 0 ? 
      this.totalNetProfit / this.totalFeesPaid : 0;

    return {
      totalFeesPaid: this.totalFeesPaid,
      totalNetProfit: this.totalNetProfit,
      tradesToday: this.tradesToday,
      maxTradesPerDay: this.parameters.maxTradesPerDay,
      averageProfitPerTrade,
      feeCoverageRatio
    };
  }

  public getFeeStatistics(): {
    feeCalculator: any;
    strategy: any;
  } {
    return {
      feeCalculator: feeCalculator.getFeeStatistics(),
      strategy: this.getFeeAwareMetrics()
    };
  }
}
