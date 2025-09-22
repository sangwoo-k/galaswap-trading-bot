import { galaSwapClient } from '../api/galaswap-client';
import { appLogger } from '../utils/logger';
import { TokenInfo } from '../types';

export interface FeeCalculation {
  galaFee: number;
  galaFeeInUSD: number;
  minimumProfitRequired: number;
  minimumProfitPercentage: number;
  isProfitable: boolean;
  netProfit: number;
  netProfitPercentage: number;
}

export interface TransactionCosts {
  gasCost: number;
  slippage: number;
  platformFee: number;
  totalCosts: number;
  totalCostsPercentage: number;
}

export class FeeCalculator {
  private static instance: FeeCalculator;
  private readonly FLAT_GALA_FEE = 1; // 1 GALA flat fee per transaction
  private galaPriceCache: { price: number; timestamp: number } | null = null;
  private readonly CACHE_DURATION = 60000; // 1 minute cache

  private constructor() {}

  public static getInstance(): FeeCalculator {
    if (!FeeCalculator.instance) {
      FeeCalculator.instance = new FeeCalculator();
    }
    return FeeCalculator.instance;
  }

  /**
   * Calculate if a transaction is profitable after fees
   */
  public async calculateTransactionProfitability(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    expectedAmountOut: string,
    currentPrice: number
  ): Promise<FeeCalculation> {
    try {
      // Get current GALA price
      const galaPrice = await this.getGalaPrice();
      
      // Calculate flat GALA fee in USD
      const galaFeeInUSD = this.FLAT_GALA_FEE * galaPrice;
      
      // Calculate transaction costs
      const transactionCosts = await this.calculateTransactionCosts(
        tokenIn,
        tokenOut,
        amountIn,
        expectedAmountOut
      );
      
      // Calculate total costs (GALA fee + transaction costs)
      const totalCosts = galaFeeInUSD + transactionCosts.totalCosts;
      
      // Calculate expected profit
      const amountInUSD = parseFloat(amountIn) * currentPrice;
      const expectedAmountOutUSD = parseFloat(expectedAmountOut) * currentPrice;
      const grossProfit = expectedAmountOutUSD - amountInUSD;
      
      // Calculate net profit after all costs
      const netProfit = grossProfit - totalCosts;
      const netProfitPercentage = (netProfit / amountInUSD) * 100;
      
      // Calculate minimum profit required
      const minimumProfitRequired = totalCosts;
      const minimumProfitPercentage = (minimumProfitRequired / amountInUSD) * 100;
      
      // Determine if transaction is profitable
      const isProfitable = netProfit > 0 && netProfit >= galaFeeInUSD;
      
      const calculation: FeeCalculation = {
        galaFee: this.FLAT_GALA_FEE,
        galaFeeInUSD,
        minimumProfitRequired,
        minimumProfitPercentage,
        isProfitable,
        netProfit,
        netProfitPercentage
      };
      
      // Log the calculation
      appLogger.logSystemEvent('Fee calculation completed', {
        tokenIn,
        tokenOut,
        amountIn,
        expectedAmountOut,
        galaFee: this.FLAT_GALA_FEE,
        galaFeeInUSD,
        totalCosts,
        netProfit,
        isProfitable
      });
      
      return calculation;
      
    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'calculate_transaction_profitability',
        tokenIn,
        tokenOut,
        amountIn,
        expectedAmountOut
      });
      
      // Return unprofitable calculation on error
      return {
        galaFee: this.FLAT_GALA_FEE,
        galaFeeInUSD: 0,
        minimumProfitRequired: 0,
        minimumProfitPercentage: 0,
        isProfitable: false,
        netProfit: -1,
        netProfitPercentage: -1
      };
    }
  }

  /**
   * Calculate minimum amount required for profitable transaction
   */
  public async calculateMinimumAmount(
    tokenIn: string,
    tokenOut: string,
    currentPrice: number
  ): Promise<{
    minimumAmount: number;
    minimumAmountUSD: number;
    reason: string;
  }> {
    try {
      const galaPrice = await this.getGalaPrice();
      const galaFeeInUSD = this.FLAT_GALA_FEE * galaPrice;
      
      // Estimate transaction costs (gas + slippage)
      const estimatedTransactionCosts = galaFeeInUSD * 0.1; // Assume 10% of GALA fee for other costs
      const totalCosts = galaFeeInUSD + estimatedTransactionCosts;
      
      // Calculate minimum amount needed to cover costs with 5% profit margin
      const profitMargin = 1.05; // 5% profit margin
      const minimumAmountUSD = totalCosts * profitMargin;
      const minimumAmount = minimumAmountUSD / currentPrice;
      
      return {
        minimumAmount,
        minimumAmountUSD,
        reason: `Minimum amount to cover 1 GALA fee ($${galaFeeInUSD.toFixed(2)}) + transaction costs + 5% profit margin`
      };
      
    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'calculate_minimum_amount',
        tokenIn,
        tokenOut,
        currentPrice
      });
      
      return {
        minimumAmount: 0,
        minimumAmountUSD: 0,
        reason: 'Error calculating minimum amount'
      };
    }
  }

  /**
   * Validate transaction before execution
   */
  public async validateTransaction(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    expectedAmountOut: string,
    currentPrice: number
  ): Promise<{
    isValid: boolean;
    reason: string;
    feeCalculation: FeeCalculation;
  }> {
    const feeCalculation = await this.calculateTransactionProfitability(
      tokenIn,
      tokenOut,
      amountIn,
      expectedAmountOut,
      currentPrice
    );
    
    if (!feeCalculation.isProfitable) {
      return {
        isValid: false,
        reason: `Transaction not profitable. Net profit: $${feeCalculation.netProfit.toFixed(2)}, Required: $${feeCalculation.galaFeeInUSD.toFixed(2)} GALA fee`,
        feeCalculation
      };
    }
    
    if (feeCalculation.netProfit < feeCalculation.galaFeeInUSD) {
      return {
        isValid: false,
        reason: `Net profit ($${feeCalculation.netProfit.toFixed(2)}) is less than GALA fee ($${feeCalculation.galaFeeInUSD.toFixed(2)})`,
        feeCalculation
      };
    }
    
    return {
      isValid: true,
      reason: `Transaction is profitable. Net profit: $${feeCalculation.netProfit.toFixed(2)} (${feeCalculation.netProfitPercentage.toFixed(2)}%)`,
      feeCalculation
    };
  }

  /**
   * Get current GALA price with caching
   */
  private async getGalaPrice(): Promise<number> {
    try {
      // Check cache first
      if (this.galaPriceCache && 
          Date.now() - this.galaPriceCache.timestamp < this.CACHE_DURATION) {
        return this.galaPriceCache.price;
      }
      
      // Fetch fresh price
      const marketData = await galaSwapClient.getMarketData('GALA', 'ETH');
      const galaPrice = marketData.price;
      
      // Update cache
      this.galaPriceCache = {
        price: galaPrice,
        timestamp: Date.now()
      };
      
      return galaPrice;
      
    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'get_gala_price'
      });
      
      // Return cached price if available, otherwise default
      if (this.galaPriceCache) {
        return this.galaPriceCache.price;
      }
      
      // Default GALA price if all else fails
      return 0.05; // $0.05 default
    }
  }

  /**
   * Calculate transaction costs (gas, slippage, platform fees)
   */
  private async calculateTransactionCosts(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    expectedAmountOut: string
  ): Promise<TransactionCosts> {
    try {
      // Estimate gas cost (simplified)
      const gasPrice = 20; // gwei
      const gasLimit = 150000; // estimated gas limit
      const gasCost = (gasPrice * gasLimit) / 1e9; // Convert to ETH
      
      // Estimate slippage cost
      const amountInNum = parseFloat(amountIn);
      const expectedAmountOutNum = parseFloat(expectedAmountOut);
      const slippage = amountInNum * 0.005; // 0.5% slippage estimate
      
      // Platform fee (if any)
      const platformFee = amountInNum * 0.003; // 0.3% platform fee estimate
      
      const totalCosts = gasCost + slippage + platformFee;
      const totalCostsPercentage = (totalCosts / amountInNum) * 100;
      
      return {
        gasCost,
        slippage,
        platformFee,
        totalCosts,
        totalCostsPercentage
      };
      
    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'calculate_transaction_costs',
        tokenIn,
        tokenOut,
        amountIn,
        expectedAmountOut
      });
      
      // Return default costs on error
      return {
        gasCost: 0.01,
        slippage: 0,
        platformFee: 0,
        totalCosts: 0.01,
        totalCostsPercentage: 0.1
      };
    }
  }

  /**
   * Get fee statistics
   */
  public getFeeStatistics(): {
    flatGalaFee: number;
    cacheStatus: string;
    lastPriceUpdate: string;
  } {
    return {
      flatGalaFee: this.FLAT_GALA_FEE,
      cacheStatus: this.galaPriceCache ? 'Active' : 'Empty',
      lastPriceUpdate: this.galaPriceCache ? 
        new Date(this.galaPriceCache.timestamp).toLocaleString() : 'Never'
    };
  }

  /**
   * Update GALA fee (for configuration changes)
   */
  public updateGalaFee(newFee: number): void {
    if (newFee > 0) {
      (this as any).FLAT_GALA_FEE = newFee;
      appLogger.logSystemEvent('GALA fee updated', {
        oldFee: this.FLAT_GALA_FEE,
        newFee
      });
    }
  }
}

// Export singleton instance
export const feeCalculator = FeeCalculator.getInstance();
