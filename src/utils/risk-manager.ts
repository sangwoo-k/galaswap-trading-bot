import { EventEmitter } from 'events';
import { appLogger } from '../utils/logger';
import { monitoringSystem } from '../utils/monitoring';
import { Position, RiskMetrics } from '../types';

export interface RiskLimits {
  maxTotalExposure: number;
  maxPositionSize: number;
  maxDailyLoss: number;
  maxDrawdown: number;
  maxCorrelation: number;
  maxLeverage: number;
  minLiquidity: number;
  maxVolatility: number;
}

export interface PortfolioMetrics {
  totalValue: number;
  totalExposure: number;
  dailyPnL: number;
  maxDrawdown: number;
  sharpeRatio: number;
  winRate: number;
  averageWin: number;
  averageLoss: number;
  correlationMatrix: Record<string, number>;
  volatility: number;
  liquidity: number;
}

export class RiskManager extends EventEmitter {
  private static instance: RiskManager;
  private riskLimits: RiskLimits;
  private portfolioMetrics: PortfolioMetrics;
  private positions: Map<string, Position> = new Map();
  private dailyStartValue: number = 0;
  private maxPortfolioValue: number = 0;

  private constructor() {
    super();
    this.riskLimits = this.getDefaultRiskLimits();
    this.portfolioMetrics = this.initializePortfolioMetrics();
  }

  public static getInstance(): RiskManager {
    if (!RiskManager.instance) {
      RiskManager.instance = new RiskManager();
    }
    return RiskManager.instance;
  }

  private getDefaultRiskLimits(): RiskLimits {
    return {
      maxTotalExposure: 10000, // $10,000 max total exposure
      maxPositionSize: 1000, // $1,000 max per position
      maxDailyLoss: 500, // $500 max daily loss
      maxDrawdown: 0.15, // 15% max drawdown
      maxCorrelation: 0.7, // 70% max correlation between positions
      maxLeverage: 1.0, // No leverage
      minLiquidity: 10000, // $10,000 minimum liquidity
      maxVolatility: 0.5 // 50% max volatility
    };
  }

  private initializePortfolioMetrics(): PortfolioMetrics {
    return {
      totalValue: 0,
      totalExposure: 0,
      dailyPnL: 0,
      maxDrawdown: 0,
      sharpeRatio: 0,
      winRate: 0,
      averageWin: 0,
      averageLoss: 0,
      correlationMatrix: {},
      volatility: 0,
      liquidity: 0
    };
  }

  /**
   * Check if a new position is allowed based on risk limits
   */
  public async checkPositionRisk(
    tokenIn: string,
    tokenOut: string,
    amount: number,
    price: number
  ): Promise<{ allowed: boolean; reason?: string; riskScore: number }> {
    try {
      const positionValue = amount * price;
      let riskScore = 0;
      const reasons: string[] = [];

      // Check maximum position size
      if (positionValue > this.riskLimits.maxPositionSize) {
        return {
          allowed: false,
          reason: `Position size ${positionValue} exceeds maximum ${this.riskLimits.maxPositionSize}`,
          riskScore: 100
        };
      }

      // Check total exposure
      const newTotalExposure = this.portfolioMetrics.totalExposure + positionValue;
      if (newTotalExposure > this.riskLimits.maxTotalExposure) {
        return {
          allowed: false,
          reason: `Total exposure ${newTotalExposure} would exceed maximum ${this.riskLimits.maxTotalExposure}`,
          riskScore: 100
        };
      }

      // Check daily loss limit
      if (this.portfolioMetrics.dailyPnL < -this.riskLimits.maxDailyLoss) {
        return {
          allowed: false,
          reason: `Daily loss ${Math.abs(this.portfolioMetrics.dailyPnL)} exceeds limit ${this.riskLimits.maxDailyLoss}`,
          riskScore: 100
        };
      }

      // Check drawdown
      if (this.portfolioMetrics.maxDrawdown > this.riskLimits.maxDrawdown) {
        return {
          allowed: false,
          reason: `Drawdown ${this.portfolioMetrics.maxDrawdown} exceeds limit ${this.riskLimits.maxDrawdown}`,
          riskScore: 100
        };
      }

      // Calculate risk score
      riskScore += (positionValue / this.riskLimits.maxPositionSize) * 30;
      riskScore += (newTotalExposure / this.riskLimits.maxTotalExposure) * 25;
      riskScore += Math.abs(this.portfolioMetrics.dailyPnL / this.riskLimits.maxDailyLoss) * 20;
      riskScore += (this.portfolioMetrics.maxDrawdown / this.riskLimits.maxDrawdown) * 15;
      riskScore += (this.portfolioMetrics.volatility / this.riskLimits.maxVolatility) * 10;

      // Check correlation risk
      const correlationRisk = this.calculateCorrelationRisk(tokenIn, tokenOut);
      if (correlationRisk > this.riskLimits.maxCorrelation) {
        riskScore += 20;
        reasons.push(`High correlation risk: ${correlationRisk}`);
      }

      // Check liquidity risk
      if (this.portfolioMetrics.liquidity < this.riskLimits.minLiquidity) {
        riskScore += 15;
        reasons.push(`Low liquidity: ${this.portfolioMetrics.liquidity}`);
      }

      const allowed = riskScore < 80; // Allow if risk score is below 80

      if (!allowed) {
        reasons.push(`Risk score ${riskScore} exceeds threshold 80`);
      }

      return {
        allowed,
        reason: reasons.length > 0 ? reasons.join(', ') : undefined,
        riskScore
      };

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'check_position_risk',
        tokenIn,
        tokenOut,
        amount,
        price
      });

      return {
        allowed: false,
        reason: 'Error calculating risk',
        riskScore: 100
      };
    }
  }

  /**
   * Update portfolio metrics
   */
  public updatePortfolioMetrics(positions: Position[]): void {
    try {
      this.positions.clear();
      positions.forEach(pos => this.positions.set(pos.id, pos));

      // Calculate total exposure
      this.portfolioMetrics.totalExposure = positions.reduce(
        (sum, pos) => sum + parseFloat(pos.amountIn), 0
      );

      // Calculate daily P&L
      const today = new Date().toDateString();
      const todayPositions = positions.filter(pos => 
        pos.createdAt.toDateString() === today
      );
      
      this.portfolioMetrics.dailyPnL = todayPositions.reduce(
        (sum, pos) => sum + (parseFloat(pos.amountOut) - parseFloat(pos.amountIn)), 0
      );

      // Calculate drawdown
      const currentValue = this.portfolioMetrics.totalValue;
      if (currentValue > this.maxPortfolioValue) {
        this.maxPortfolioValue = currentValue;
      }
      
      this.portfolioMetrics.maxDrawdown = this.maxPortfolioValue > 0 ?
        (this.maxPortfolioValue - currentValue) / this.maxPortfolioValue : 0;

      // Calculate win rate and average win/loss
      const closedPositions = positions.filter(pos => pos.status === 'closed');
      if (closedPositions.length > 0) {
        const profitablePositions = closedPositions.filter(pos => 
          parseFloat(pos.amountOut) > parseFloat(pos.amountIn)
        );
        
        this.portfolioMetrics.winRate = profitablePositions.length / closedPositions.length;
        
        const wins = profitablePositions.map(pos => 
          parseFloat(pos.amountOut) - parseFloat(pos.amountIn)
        );
        const losses = closedPositions
          .filter(pos => parseFloat(pos.amountOut) <= parseFloat(pos.amountIn))
          .map(pos => parseFloat(pos.amountIn) - parseFloat(pos.amountOut));
        
        this.portfolioMetrics.averageWin = wins.length > 0 ? 
          wins.reduce((sum, win) => sum + win, 0) / wins.length : 0;
        this.portfolioMetrics.averageLoss = losses.length > 0 ?
          losses.reduce((sum, loss) => sum + loss, 0) / losses.length : 0;
      }

      // Calculate correlation matrix
      this.portfolioMetrics.correlationMatrix = this.calculateCorrelationMatrix(positions);

      // Emit risk event if limits are exceeded
      this.checkRiskLimits();

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'update_portfolio_metrics'
      });
    }
  }

  private calculateCorrelationRisk(tokenIn: string, tokenOut: string): number {
    // Simplified correlation calculation
    // In a real implementation, you would use historical price data
    const existingTokens = Array.from(this.positions.values())
      .flatMap(pos => [pos.tokenIn, pos.tokenOut]);
    
    const tokenCount = existingTokens.filter(token => 
      token === tokenIn || token === tokenOut
    ).length;
    
    return tokenCount / Math.max(existingTokens.length, 1);
  }

  private calculateCorrelationMatrix(positions: Position[]): Record<string, number> {
    // Simplified correlation matrix
    // In a real implementation, you would calculate actual correlations
    const tokens = [...new Set(positions.flatMap(pos => [pos.tokenIn, pos.tokenOut]))];
    const matrix: Record<string, number> = {};
    
    for (const token1 of tokens) {
      for (const token2 of tokens) {
        if (token1 !== token2) {
          matrix[`${token1}-${token2}`] = Math.random() * 0.5; // Placeholder
        }
      }
    }
    
    return matrix;
  }

  private checkRiskLimits(): void {
    const violations: string[] = [];

    if (this.portfolioMetrics.totalExposure > this.riskLimits.maxTotalExposure) {
      violations.push('Total exposure limit exceeded');
    }

    if (this.portfolioMetrics.dailyPnL < -this.riskLimits.maxDailyLoss) {
      violations.push('Daily loss limit exceeded');
    }

    if (this.portfolioMetrics.maxDrawdown > this.riskLimits.maxDrawdown) {
      violations.push('Drawdown limit exceeded');
    }

    if (violations.length > 0) {
      const securityEvent = {
        type: 'risk_management' as const,
        severity: 'high' as const,
        message: `Risk limits violated: ${violations.join(', ')}`,
        timestamp: new Date(),
        metadata: {
          violations,
          portfolioMetrics: this.portfolioMetrics
        }
      };

      monitoringSystem.recordSecurityEvent(securityEvent);
      this.emit('riskViolation', securityEvent);
    }
  }

  /**
   * Get current risk metrics
   */
  public getRiskMetrics(): {
    portfolioMetrics: PortfolioMetrics;
    riskLimits: RiskLimits;
    riskScore: number;
    recommendations: string[];
  } {
    const riskScore = this.calculateOverallRiskScore();
    const recommendations = this.generateRecommendations();

    return {
      portfolioMetrics: this.portfolioMetrics,
      riskLimits: this.riskLimits,
      riskScore,
      recommendations
    };
  }

  private calculateOverallRiskScore(): number {
    let score = 0;
    
    score += (this.portfolioMetrics.totalExposure / this.riskLimits.maxTotalExposure) * 25;
    score += Math.abs(this.portfolioMetrics.dailyPnL / this.riskLimits.maxDailyLoss) * 25;
    score += (this.portfolioMetrics.maxDrawdown / this.riskLimits.maxDrawdown) * 25;
    score += (this.portfolioMetrics.volatility / this.riskLimits.maxVolatility) * 25;
    
    return Math.min(score, 100);
  }

  private generateRecommendations(): string[] {
    const recommendations: string[] = [];

    if (this.portfolioMetrics.totalExposure > this.riskLimits.maxTotalExposure * 0.8) {
      recommendations.push('Consider reducing position sizes - approaching exposure limit');
    }

    if (this.portfolioMetrics.dailyPnL < -this.riskLimits.maxDailyLoss * 0.5) {
      recommendations.push('Daily losses approaching limit - consider stopping trading');
    }

    if (this.portfolioMetrics.maxDrawdown > this.riskLimits.maxDrawdown * 0.7) {
      recommendations.push('High drawdown detected - consider risk reduction');
    }

    if (this.portfolioMetrics.winRate < 0.4) {
      recommendations.push('Low win rate - review trading strategies');
    }

    if (this.portfolioMetrics.volatility > this.riskLimits.maxVolatility * 0.8) {
      recommendations.push('High volatility detected - consider reducing position sizes');
    }

    return recommendations;
  }

  /**
   * Update risk limits
   */
  public updateRiskLimits(newLimits: Partial<RiskLimits>): void {
    this.riskLimits = { ...this.riskLimits, ...newLimits };
    
    appLogger.logSystemEvent('Risk limits updated', {
      newLimits,
      timestamp: new Date().toISOString()
    });
  }
}

// Export singleton instance
export const riskManager = RiskManager.getInstance();
