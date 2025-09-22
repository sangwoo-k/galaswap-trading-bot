import { EventEmitter } from 'events';
import { galaSwapClient } from '../api/galaswap-client';
import { appLogger } from '../utils/logger';
import { monitoringSystem } from '../utils/monitoring';
import { securityManager } from '../utils/security';
import { 
  TradingStrategy, 
  Position, 
  MarketData, 
  TokenInfo,
  RiskMetrics 
} from '../types';

export abstract class BaseTradingStrategy extends EventEmitter {
  protected readonly name: string;
  protected readonly riskLevel: 'low' | 'medium' | 'high';
  protected enabled: boolean;
  protected parameters: Record<string, any>;
  protected positions: Map<string, Position> = new Map();
  protected isRunning: boolean = false;

  constructor(name: string, riskLevel: 'low' | 'medium' | 'high', parameters: Record<string, any> = {}) {
    super();
    this.name = name;
    this.riskLevel = riskLevel;
    this.parameters = parameters;
    this.enabled = true;
  }

  /**
   * Initialize the strategy
   */
  public abstract initialize(): Promise<void>;

  /**
   * Execute the strategy logic
   */
  public abstract execute(): Promise<void>;

  /**
   * Stop the strategy
   */
  public abstract stop(): Promise<void>;

  /**
   * Get strategy configuration
   */
  public getConfig(): TradingStrategy {
    return {
      name: this.name,
      enabled: this.enabled,
      parameters: this.parameters,
      riskLevel: this.riskLevel
    };
  }

  /**
   * Update strategy parameters
   */
  public updateParameters(newParameters: Record<string, any>): void {
    this.parameters = { ...this.parameters, ...newParameters };
    appLogger.logSystemEvent('Strategy parameters updated', {
      strategy: this.name,
      parameters: newParameters
    });
  }

  /**
   * Enable or disable the strategy
   */
  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    appLogger.logSystemEvent('Strategy status changed', {
      strategy: this.name,
      enabled
    });
  }

  /**
   * Get current positions
   */
  public getPositions(): Position[] {
    return Array.from(this.positions.values());
  }

  /**
   * Get strategy performance metrics
   */
  public getPerformanceMetrics(): RiskMetrics {
    const positions = this.getPositions();
    const closedPositions = positions.filter(pos => pos.status === 'closed');
    
    if (closedPositions.length === 0) {
      return {
        totalExposure: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        winRate: 0,
        averageWin: 0,
        averageLoss: 0
      };
    }

    const totalExposure = positions.reduce((sum, pos) => sum + parseFloat(pos.amountIn), 0);
    const profitablePositions = closedPositions.filter(pos => parseFloat(pos.amountOut) > parseFloat(pos.amountIn));
    const winRate = profitablePositions.length / closedPositions.length;

    const wins = profitablePositions.map(pos => parseFloat(pos.amountOut) - parseFloat(pos.amountIn));
    const losses = closedPositions
      .filter(pos => parseFloat(pos.amountOut) <= parseFloat(pos.amountIn))
      .map(pos => parseFloat(pos.amountIn) - parseFloat(pos.amountOut));

    const averageWin = wins.length > 0 ? wins.reduce((sum, win) => sum + win, 0) / wins.length : 0;
    const averageLoss = losses.length > 0 ? losses.reduce((sum, loss) => sum + loss, 0) / losses.length : 0;

    // Calculate Sharpe ratio (simplified)
    const returns = closedPositions.map(pos => (parseFloat(pos.amountOut) - parseFloat(pos.amountIn)) / parseFloat(pos.amountIn));
    const avgReturn = returns.reduce((sum, ret) => sum + ret, 0) / returns.length;
    const returnStdDev = Math.sqrt(returns.reduce((sum, ret) => sum + Math.pow(ret - avgReturn, 2), 0) / returns.length);
    const sharpeRatio = returnStdDev > 0 ? avgReturn / returnStdDev : 0;

    return {
      totalExposure,
      maxDrawdown: 0, // Would need historical data to calculate properly
      sharpeRatio,
      winRate,
      averageWin,
      averageLoss
    };
  }

  /**
   * Validate trade parameters
   */
  protected validateTradeParameters(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): { valid: boolean; error?: string } {
    // Validate token addresses
    if (!securityManager.validateWalletAddress(tokenIn) || !securityManager.validateWalletAddress(tokenOut)) {
      return { valid: false, error: 'Invalid token addresses' };
    }

    // Validate amount
    const amount = parseFloat(amountIn);
    if (isNaN(amount) || amount <= 0) {
      return { valid: false, error: 'Invalid amount' };
    }

    // Check maximum position size
    const maxPositionSize = this.parameters.maxPositionSize || 0.1;
    if (amount > maxPositionSize) {
      return { valid: false, error: 'Amount exceeds maximum position size' };
    }

    return { valid: true };
  }

  /**
   * Create a new position
   */
  protected createPosition(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    entryPrice: number,
    stopLoss?: number,
    takeProfit?: number
  ): Position {
    const positionId = securityManager.generateUniqueKey();
    
    const position: Position = {
      id: positionId,
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: '0',
      entryPrice,
      currentPrice: entryPrice,
      stopLoss,
      takeProfit,
      status: 'open',
      createdAt: new Date(),
      updatedAt: new Date()
    };

    this.positions.set(positionId, position);
    
    appLogger.logTrade('position_created', {
      tokenIn,
      tokenOut,
      amountIn,
      amountOut: '0',
      price: entryPrice
    });

    return position;
  }

  /**
   * Update position
   */
  protected updatePosition(positionId: string, updates: Partial<Position>): void {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position not found: ${positionId}`);
    }

    const updatedPosition = {
      ...position,
      ...updates,
      updatedAt: new Date()
    };

    this.positions.set(positionId, updatedPosition);

    // Check for stop loss or take profit
    this.checkStopLossTakeProfit(updatedPosition);
  }

  /**
   * Check stop loss and take profit conditions
   */
  private checkStopLossTakeProfit(position: Position): void {
    if (position.status !== 'open') return;

    const currentPrice = position.currentPrice;
    const entryPrice = position.entryPrice;
    const priceChange = (currentPrice - entryPrice) / entryPrice;

    // Check stop loss
    if (position.stopLoss && priceChange <= -position.stopLoss / 100) {
      this.closePosition(position.id, 'stopped');
      appLogger.logTrade('position_stopped', {
        tokenIn: position.tokenIn,
        tokenOut: position.tokenOut,
        amountIn: position.amountIn,
        amountOut: position.amountOut,
        price: currentPrice,
        reason: 'stop_loss'
      });
    }

    // Check take profit
    if (position.takeProfit && priceChange >= position.takeProfit / 100) {
      this.closePosition(position.id, 'closed');
      appLogger.logTrade('position_closed', {
        tokenIn: position.tokenIn,
        tokenOut: position.tokenOut,
        amountIn: position.amountIn,
        amountOut: position.amountOut,
        price: currentPrice,
        reason: 'take_profit'
      });
    }
  }

  /**
   * Close a position
   */
  protected closePosition(positionId: string, status: 'closed' | 'stopped'): void {
    const position = this.positions.get(positionId);
    if (!position) {
      throw new Error(`Position not found: ${positionId}`);
    }

    position.status = status;
    position.updatedAt = new Date();

    this.positions.set(positionId, position);

    // Update monitoring system
    monitoringSystem.updatePositions(this.getPositions());
  }

  /**
   * Get market data for a token pair
   */
  protected async getMarketData(tokenIn: string, tokenOut: string): Promise<MarketData> {
    try {
      return await galaSwapClient.getMarketData(tokenIn, tokenOut);
    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'getMarketData',
        strategy: this.name,
        tokenIn,
        tokenOut
      });
      throw error;
    }
  }

  /**
   * Get quote for a trade
   */
  protected async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: string
  ): Promise<{
    amountOut: string;
    priceImpact: number;
    minimumReceived: string;
  }> {
    try {
      return await galaSwapClient.getQuote(tokenIn, tokenOut, amountIn);
    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'getQuote',
        strategy: this.name,
        tokenIn,
        tokenOut,
        amountIn
      });
      throw error;
    }
  }

  /**
   * Execute a trade
   */
  protected async executeTrade(
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    amountOutMin: string,
    deadline: number = Date.now() + 300000 // 5 minutes default
  ): Promise<{ success: boolean; transactionHash?: string; error?: string }> {
    try {
      const validation = this.validateTradeParameters(tokenIn, tokenOut, amountIn);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      const result = await galaSwapClient.executeTrade({
        tokenIn,
        tokenOut,
        amountIn,
        amountOutMin,
        deadline
      });

      if (result.success) {
        this.emit('tradeExecuted', {
          tokenIn,
          tokenOut,
          amountIn,
          amountOut: result.data?.amountOut || '0',
          transactionHash: result.transactionHash
        });
      }

      return result;
    } catch (error) {
      const errorMessage = (error as Error).message;
      appLogger.logError(error as Error, {
        operation: 'executeTrade',
        strategy: this.name,
        tokenIn,
        tokenOut,
        amountIn
      });

      return { success: false, error: errorMessage };
    }
  }

  /**
   * Check if strategy should run
   */
  protected shouldRun(): boolean {
    return this.enabled && this.isRunning;
  }

  /**
   * Log strategy event
   */
  protected logEvent(event: string, data?: any): void {
    appLogger.logSystemEvent(`Strategy: ${this.name} - ${event}`, {
      strategy: this.name,
      ...data
    });
  }
}
