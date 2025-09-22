import { BaseTradingStrategy } from './base-strategy';
import { galaSwapClient } from '../api/galaswap-client';
import { appLogger } from '../utils/logger';
import { MarketData, TokenInfo } from '../types';

export interface ArbitrageParameters {
  minProfitThreshold: number; // Minimum profit percentage to execute arbitrage
  maxTradeAmount: number; // Maximum amount to trade in a single arbitrage
  priceDifferenceThreshold: number; // Minimum price difference to consider arbitrage
  gasPriceThreshold: number; // Maximum gas price to pay for arbitrage
  maxSlippage: number; // Maximum slippage tolerance
  cooldownPeriod: number; // Cooldown period between arbitrage attempts (ms)
}

export class ArbitrageStrategy extends BaseTradingStrategy {
  private parameters: ArbitrageParameters;
  private lastExecutionTime: number = 0;
  private priceCache: Map<string, { price: number; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 30000; // 30 seconds

  constructor(parameters: Partial<ArbitrageParameters> = {}) {
    super('Arbitrage Strategy', 'medium', parameters);
    
    this.parameters = {
      minProfitThreshold: 0.5, // 0.5% minimum profit
      maxTradeAmount: 1000,
      priceDifferenceThreshold: 0.1, // 0.1% minimum price difference
      gasPriceThreshold: 50, // 50 gwei max gas price
      maxSlippage: 1.0, // 1% max slippage
      cooldownPeriod: 60000, // 1 minute cooldown
      ...parameters
    };
  }

  public async initialize(): Promise<void> {
    this.logEvent('Initializing arbitrage strategy', this.parameters);
    this.isRunning = true;
  }

  public async execute(): Promise<void> {
    if (!this.shouldRun()) return;

    try {
      // Check cooldown period
      const now = Date.now();
      if (now - this.lastExecutionTime < this.parameters.cooldownPeriod) {
        return;
      }

      // Get trading pairs
      const pairs = await galaSwapClient.getTradingPairs();
      
      // Find arbitrage opportunities
      const opportunities = await this.findArbitrageOpportunities(pairs);
      
      if (opportunities.length > 0) {
        // Execute the most profitable arbitrage
        const bestOpportunity = opportunities[0];
        await this.executeArbitrage(bestOpportunity);
        this.lastExecutionTime = now;
      }

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'arbitrage_execution',
        strategy: this.name
      });
    }
  }

  public async stop(): Promise<void> {
    this.isRunning = false;
    this.logEvent('Arbitrage strategy stopped');
  }

  private async findArbitrageOpportunities(pairs: any[]): Promise<ArbitrageOpportunity[]> {
    const opportunities: ArbitrageOpportunity[] = [];

    for (const pair of pairs) {
      try {
        // Get current market data
        const marketData = await this.getMarketData(pair.token0.address, pair.token1.address);
        
        // Check for price discrepancies
        const opportunity = await this.analyzeArbitrageOpportunity(
          pair.token0,
          pair.token1,
          marketData
        );

        if (opportunity && opportunity.profitPercentage >= this.parameters.minProfitThreshold) {
          opportunities.push(opportunity);
        }

      } catch (error) {
        appLogger.logError(error as Error, {
          operation: 'find_arbitrage_opportunities',
          pair: `${pair.token0.symbol}/${pair.token1.symbol}`
        });
      }
    }

    // Sort by profit percentage (highest first)
    return opportunities.sort((a, b) => b.profitPercentage - a.profitPercentage);
  }

  private async analyzeArbitrageOpportunity(
    token0: TokenInfo,
    token1: TokenInfo,
    marketData: MarketData
  ): Promise<ArbitrageOpportunity | null> {
    try {
      // Get quotes for both directions
      const amountIn = this.parameters.maxTradeAmount.toString();
      
      const quote0to1 = await galaSwapClient.getQuote(token0.address, token1.address, amountIn);
      const quote1to0 = await galaSwapClient.getQuote(token1.address, token0.address, quote0to1.amountOut);

      // Calculate potential profit
      const originalAmount = parseFloat(amountIn);
      const finalAmount = parseFloat(quote1to0.amountOut);
      const profit = finalAmount - originalAmount;
      const profitPercentage = (profit / originalAmount) * 100;

      // Check if profitable after considering gas costs
      const estimatedGasCost = await this.estimateGasCost();
      const netProfit = profit - estimatedGasCost;
      const netProfitPercentage = (netProfit / originalAmount) * 100;

      if (netProfitPercentage >= this.parameters.minProfitThreshold) {
        return {
          token0,
          token1,
          amountIn: originalAmount,
          expectedProfit: netProfit,
          profitPercentage: netProfitPercentage,
          priceImpact: Math.max(quote0to1.priceImpact, quote1to0.priceImpact),
          gasEstimate: estimatedGasCost
        };
      }

      return null;
    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'analyze_arbitrage_opportunity',
        token0: token0.symbol,
        token1: token1.symbol
      });
      return null;
    }
  }

  private async executeArbitrage(opportunity: ArbitrageOpportunity): Promise<void> {
    try {
      this.logEvent('Executing arbitrage', {
        token0: opportunity.token0.symbol,
        token1: opportunity.token1.symbol,
        amount: opportunity.amountIn,
        expectedProfit: opportunity.expectedProfit,
        profitPercentage: opportunity.profitPercentage
      });

      const amountIn = opportunity.amountIn.toString();
      const deadline = Date.now() + 300000; // 5 minutes

      // First trade: token0 -> token1
      const firstTrade = await this.executeTrade(
        opportunity.token0.address,
        opportunity.token1.address,
        amountIn,
        '0', // Will be calculated based on slippage
        deadline
      );

      if (!firstTrade.success) {
        throw new Error(`First trade failed: ${firstTrade.error}`);
      }

      // Get the actual amount received from first trade
      const actualAmountOut = await this.getActualTradeAmount(firstTrade.transactionHash!);
      
      // Second trade: token1 -> token0
      const secondTrade = await this.executeTrade(
        opportunity.token1.address,
        opportunity.token0.address,
        actualAmountOut,
        '0', // Will be calculated based on slippage
        deadline
      );

      if (!secondTrade.success) {
        throw new Error(`Second trade failed: ${secondTrade.error}`);
      }

      // Log successful arbitrage
      this.logEvent('Arbitrage completed successfully', {
        token0: opportunity.token0.symbol,
        token1: opportunity.token1.symbol,
        firstTradeHash: firstTrade.transactionHash,
        secondTradeHash: secondTrade.transactionHash,
        expectedProfit: opportunity.expectedProfit
      });

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'execute_arbitrage',
        opportunity
      });
    }
  }

  private async estimateGasCost(): Promise<number> {
    // Simplified gas cost estimation
    // In a real implementation, you would query the network for current gas prices
    const gasPrice = 20; // gwei
    const gasLimit = 200000; // estimated gas limit for two swaps
    return (gasPrice * gasLimit) / 1e9; // Convert to ETH
  }

  private async getActualTradeAmount(transactionHash: string): Promise<string> {
    // In a real implementation, you would parse the transaction receipt
    // to get the actual amount received
    // For now, return a placeholder
    return '0';
  }

  private async getMarketData(tokenIn: string, tokenOut: string): Promise<MarketData> {
    // Check cache first
    const cacheKey = `${tokenIn}-${tokenOut}`;
    const cached = this.priceCache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.CACHE_DURATION) {
      return {
        timestamp: cached.timestamp,
        price: cached.price,
        volume: 0,
        high24h: 0,
        low24h: 0,
        change24h: 0
      };
    }

    // Fetch fresh data
    const marketData = await galaSwapClient.getMarketData(tokenIn, tokenOut);
    
    // Update cache
    this.priceCache.set(cacheKey, {
      price: marketData.price,
      timestamp: marketData.timestamp
    });

    return marketData;
  }
}

interface ArbitrageOpportunity {
  token0: TokenInfo;
  token1: TokenInfo;
  amountIn: number;
  expectedProfit: number;
  profitPercentage: number;
  priceImpact: number;
  gasEstimate: number;
}
