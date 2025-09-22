import { EventEmitter } from 'events';
import { appLogger } from '../utils/logger';
import { riskManager } from '../utils/risk-manager';
import { BaseTradingStrategy } from './base-strategy';
import { DCAStrategy } from './dca-strategy';
import { GridStrategy } from './grid-strategy';
import { ScalpingStrategy } from './scalping-strategy';
import { ArbitrageStrategy } from './arbitrage-strategy';
import { MomentumStrategy } from './momentum-strategy';

export interface PortfolioAllocation {
  strategy: string;
  allocation: number; // percentage of total portfolio
  riskLevel: 'low' | 'medium' | 'high';
  maxPositionSize: number;
  enabled: boolean;
}

export interface DiversificationConfig {
  maxCorrelation: number;
  maxExposurePerToken: number;
  maxExposurePerStrategy: number;
  rebalanceThreshold: number;
  emergencyStopLoss: number;
  maxDrawdown: number;
}

export class PortfolioManager extends EventEmitter {
  private static instance: PortfolioManager;
  private strategies: Map<string, BaseTradingStrategy> = new Map();
  private allocations: Map<string, PortfolioAllocation> = new Map();
  private diversificationConfig: DiversificationConfig;
  private totalPortfolioValue: number = 0;
  private isRunning: boolean = false;

  private constructor() {
    super();
    this.diversificationConfig = this.getDefaultDiversificationConfig();
    this.initializeStrategies();
    this.setupDefaultAllocations();
  }

  public static getInstance(): PortfolioManager {
    if (!PortfolioManager.instance) {
      PortfolioManager.instance = new PortfolioManager();
    }
    return PortfolioManager.instance;
  }

  private getDefaultDiversificationConfig(): DiversificationConfig {
    return {
      maxCorrelation: 0.6, // 60% max correlation between strategies
      maxExposurePerToken: 0.3, // 30% max exposure per token
      maxExposurePerStrategy: 0.4, // 40% max exposure per strategy
      rebalanceThreshold: 0.1, // 10% threshold for rebalancing
      emergencyStopLoss: 0.2, // 20% emergency stop loss
      maxDrawdown: 0.15 // 15% max drawdown
    };
  }

  private initializeStrategies(): void {
    // Initialize all available strategies
    const dcaStrategy = new DCAStrategy({
      targetToken: 'GALA',
      investmentAmount: 100,
      frequency: 24,
      maxInvestments: 30
    });

    const gridStrategy = new GridStrategy({
      baseToken: 'GALA',
      quoteToken: 'ETH',
      gridSpacing: 2,
      gridLevels: 10,
      baseAmount: 50
    });

    const scalpingStrategy = new ScalpingStrategy({
      targetToken: 'GALA',
      quoteToken: 'ETH',
      quickProfitTarget: 0.5,
      maxLossPerTrade: 0.3,
      tradeSize: 25
    });

    const arbitrageStrategy = new ArbitrageStrategy({
      minProfitThreshold: 0.5,
      maxTradeAmount: 200,
      cooldownPeriod: 300000
    });

    const momentumStrategy = new MomentumStrategy({
      momentumThreshold: 2.0,
      maxPositionSize: 300,
      stopLossPercentage: 5.0,
      takeProfitPercentage: 10.0
    });

    this.strategies.set('dca', dcaStrategy);
    this.strategies.set('grid', gridStrategy);
    this.strategies.set('scalping', scalpingStrategy);
    this.strategies.set('arbitrage', arbitrageStrategy);
    this.strategies.set('momentum', momentumStrategy);
  }

  private setupDefaultAllocations(): void {
    // Conservative allocation for loss prevention
    this.allocations.set('dca', {
      strategy: 'dca',
      allocation: 40, // 40% to DCA (low risk)
      riskLevel: 'low',
      maxPositionSize: 1000,
      enabled: true
    });

    this.allocations.set('grid', {
      strategy: 'grid',
      allocation: 25, // 25% to Grid (medium risk)
      riskLevel: 'medium',
      maxPositionSize: 500,
      enabled: true
    });

    this.allocations.set('arbitrage', {
      strategy: 'arbitrage',
      allocation: 20, // 20% to Arbitrage (medium risk)
      riskLevel: 'medium',
      maxPositionSize: 300,
      enabled: true
    });

    this.allocations.set('momentum', {
      strategy: 'momentum',
      allocation: 10, // 10% to Momentum (high risk)
      riskLevel: 'high',
      maxPositionSize: 200,
      enabled: true
    });

    this.allocations.set('scalping', {
      strategy: 'scalping',
      allocation: 5, // 5% to Scalping (high risk)
      riskLevel: 'high',
      maxPositionSize: 100,
      enabled: false // Disabled by default for safety
    });
  }

  public async start(): Promise<void> {
    try {
      this.isRunning = true;
      appLogger.logSystemEvent('Portfolio Manager started');

      // Initialize all enabled strategies
      for (const [name, allocation] of this.allocations) {
        if (allocation.enabled) {
          const strategy = this.strategies.get(name);
          if (strategy) {
            await strategy.initialize();
            appLogger.logSystemEvent('Strategy initialized', { strategy: name });
          }
        }
      }

      // Start portfolio monitoring
      this.startPortfolioMonitoring();

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'portfolio_manager_start'
      });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      this.isRunning = false;

      // Stop all strategies
      for (const [name, strategy] of this.strategies) {
        await strategy.stop();
        appLogger.logSystemEvent('Strategy stopped', { strategy: name });
      }

      appLogger.logSystemEvent('Portfolio Manager stopped');

    } catch (error) {
      appLogger.logError(error as Error, {
        operation: 'portfolio_manager_stop'
      });
      throw error;
    }
  }

  private startPortfolioMonitoring(): void {
    // Monitor portfolio every 5 minutes
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.monitorPortfolio();
        await this.checkDiversification();
        await this.rebalanceIfNeeded();
      } catch (error) {
        appLogger.logError(error as Error, {
          operation: 'portfolio_monitoring'
        });
      }
    }, 300000); // 5 minutes

    // Emergency monitoring every 30 seconds
    setInterval(async () => {
      if (!this.isRunning) return;

      try {
        await this.checkEmergencyConditions();
      } catch (error) {
        appLogger.logError(error as Error, {
          operation: 'emergency_monitoring'
        });
      }
    }, 30000); // 30 seconds
  }

  private async monitorPortfolio(): Promise<void> {
    // Collect all positions from all strategies
    const allPositions = Array.from(this.strategies.values())
      .flatMap(strategy => strategy.getPositions());

    // Update risk manager
    riskManager.updatePortfolioMetrics(allPositions);

    // Calculate portfolio metrics
    this.calculatePortfolioMetrics(allPositions);

    // Log portfolio status
    appLogger.logSystemEvent('Portfolio monitoring', {
      totalPositions: allPositions.length,
      totalValue: this.totalPortfolioValue,
      strategies: Array.from(this.allocations.keys())
    });
  }

  private calculatePortfolioMetrics(positions: any[]): void {
    // Calculate total portfolio value
    this.totalPortfolioValue = positions.reduce(
      (sum, pos) => sum + parseFloat(pos.amountIn), 0
    );

    // Calculate strategy performance
    for (const [name, strategy] of this.strategies) {
      const strategyPositions = strategy.getPositions();
      const strategyValue = strategyPositions.reduce(
        (sum, pos) => sum + parseFloat(pos.amountIn), 0
      );

      const allocation = this.allocations.get(name);
      if (allocation) {
        const targetValue = this.totalPortfolioValue * (allocation.allocation / 100);
        const actualAllocation = this.totalPortfolioValue > 0 ? 
          (strategyValue / this.totalPortfolioValue) * 100 : 0;

        appLogger.logSystemEvent('Strategy allocation', {
          strategy: name,
          targetAllocation: allocation.allocation,
          actualAllocation: actualAllocation,
          strategyValue: strategyValue
        });
      }
    }
  }

  private async checkDiversification(): Promise<void> {
    const riskMetrics = riskManager.getRiskMetrics();
    
    // Check if diversification is maintained
    if (riskMetrics.riskScore > 70) {
      appLogger.logSystemEvent('High risk detected - reducing exposure', {
        riskScore: riskMetrics.riskScore,
        recommendations: riskMetrics.recommendations
      });

      // Reduce high-risk strategy allocations
      await this.reduceHighRiskExposure();
    }
  }

  private async reduceHighRiskExposure(): Promise<void> {
    // Disable high-risk strategies temporarily
    for (const [name, allocation] of this.allocations) {
      if (allocation.riskLevel === 'high' && allocation.enabled) {
        const strategy = this.strategies.get(name);
        if (strategy) {
          strategy.setEnabled(false);
          appLogger.logSystemEvent('High-risk strategy disabled', {
            strategy: name,
            reason: 'Risk reduction'
          });
        }
      }
    }
  }

  private async rebalanceIfNeeded(): Promise<void> {
    const totalAllocation = Array.from(this.allocations.values())
      .filter(alloc => alloc.enabled)
      .reduce((sum, alloc) => sum + alloc.allocation, 0);

    // Check if rebalancing is needed
    if (Math.abs(totalAllocation - 100) > this.diversificationConfig.rebalanceThreshold * 100) {
      await this.rebalancePortfolio();
    }
  }

  private async rebalancePortfolio(): Promise<void> {
    appLogger.logSystemEvent('Portfolio rebalancing initiated');

    // Close excess positions
    for (const [name, allocation] of this.allocations) {
      if (allocation.enabled) {
        const strategy = this.strategies.get(name);
        if (strategy) {
          const positions = strategy.getPositions();
          const strategyValue = positions.reduce(
            (sum, pos) => sum + parseFloat(pos.amountIn), 0
          );
          
          const targetValue = this.totalPortfolioValue * (allocation.allocation / 100);
          
          if (strategyValue > targetValue * 1.1) { // 10% tolerance
            // Close excess positions
            const excessPositions = positions.slice(0, Math.floor(positions.length * 0.1));
            for (const position of excessPositions) {
              strategy.closePosition(position.id, 'closed');
            }
          }
        }
      }
    }
  }

  private async checkEmergencyConditions(): Promise<void> {
    const riskMetrics = riskManager.getRiskMetrics();
    
    // Emergency stop conditions
    if (riskMetrics.portfolioMetrics.maxDrawdown > this.diversificationConfig.emergencyStopLoss) {
      await this.emergencyStop();
    }

    if (riskMetrics.portfolioMetrics.dailyPnL < -this.diversificationConfig.maxDrawdown * this.totalPortfolioValue) {
      await this.emergencyStop();
    }
  }

  private async emergencyStop(): Promise<void> {
    appLogger.logSystemEvent('EMERGENCY STOP ACTIVATED', {
      reason: 'Risk limits exceeded',
      timestamp: new Date().toISOString()
    });

    // Stop all strategies immediately
    for (const [name, strategy] of this.strategies) {
      await strategy.stop();
      appLogger.logSystemEvent('Emergency stop - strategy stopped', { strategy: name });
    }

    // Close all positions
    for (const [name, strategy] of this.strategies) {
      const positions = strategy.getPositions();
      for (const position of positions) {
        if (position.status === 'open') {
          strategy.closePosition(position.id, 'stopped');
        }
      }
    }

    this.isRunning = false;
    this.emit('emergencyStop', { timestamp: new Date() });
  }

  public getPortfolioStatus(): {
    isRunning: boolean;
    totalValue: number;
    strategies: Array<{
      name: string;
      allocation: number;
      riskLevel: string;
      enabled: boolean;
      positions: number;
      performance: any;
    }>;
    riskMetrics: any;
  } {
    const strategies = Array.from(this.allocations.entries()).map(([name, allocation]) => {
      const strategy = this.strategies.get(name);
      return {
        name,
        allocation: allocation.allocation,
        riskLevel: allocation.riskLevel,
        enabled: allocation.enabled,
        positions: strategy ? strategy.getPositions().length : 0,
        performance: strategy ? strategy.getPerformanceMetrics() : null
      };
    });

    return {
      isRunning: this.isRunning,
      totalValue: this.totalPortfolioValue,
      strategies,
      riskMetrics: riskManager.getRiskMetrics()
    };
  }

  public updateAllocation(strategyName: string, newAllocation: Partial<PortfolioAllocation>): void {
    const allocation = this.allocations.get(strategyName);
    if (allocation) {
      this.allocations.set(strategyName, { ...allocation, ...newAllocation });
      
      appLogger.logSystemEvent('Portfolio allocation updated', {
        strategy: strategyName,
        newAllocation
      });
    }
  }
}

// Export singleton instance
export const portfolioManager = PortfolioManager.getInstance();
