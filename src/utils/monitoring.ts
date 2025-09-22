import { EventEmitter } from 'events';
import { appLogger } from './logger';
import { SecurityEvent, RiskMetrics, Position } from '../types';

export interface MonitoringMetrics {
  totalTrades: number;
  successfulTrades: number;
  failedTrades: number;
  totalVolume: number;
  averageTradeSize: number;
  lastTradeTime?: Date;
  systemUptime: number;
  memoryUsage: NodeJS.MemoryUsage;
  cpuUsage: number;
  apiCallsPerMinute: number;
  errorRate: number;
  securityEvents: SecurityEvent[];
  riskMetrics: RiskMetrics;
}

export class MonitoringSystem extends EventEmitter {
  private static instance: MonitoringSystem;
  private metrics: MonitoringMetrics;
  private startTime: Date;
  private tradeHistory: Array<{
    timestamp: Date;
    success: boolean;
    amount: number;
    error?: string;
  }> = [];
  private apiCallHistory: Array<{
    timestamp: Date;
    success: boolean;
    responseTime: number;
  }> = [];
  private securityEventHistory: SecurityEvent[] = [];
  private positions: Position[] = [];

  private constructor() {
    super();
    this.startTime = new Date();
    this.metrics = this.initializeMetrics();
    this.startMonitoring();
  }

  public static getInstance(): MonitoringSystem {
    if (!MonitoringSystem.instance) {
      MonitoringSystem.instance = new MonitoringSystem();
    }
    return MonitoringSystem.instance;
  }

  private initializeMetrics(): MonitoringMetrics {
    return {
      totalTrades: 0,
      successfulTrades: 0,
      failedTrades: 0,
      totalVolume: 0,
      averageTradeSize: 0,
      systemUptime: 0,
      memoryUsage: process.memoryUsage(),
      cpuUsage: 0,
      apiCallsPerMinute: 0,
      errorRate: 0,
      securityEvents: [],
      riskMetrics: {
        totalExposure: 0,
        maxDrawdown: 0,
        sharpeRatio: 0,
        winRate: 0,
        averageWin: 0,
        averageLoss: 0
      }
    };
  }

  private startMonitoring(): void {
    // Update system metrics every 30 seconds
    setInterval(() => {
      this.updateSystemMetrics();
    }, 30000);

    // Clean up old history data every hour
    setInterval(() => {
      this.cleanupHistory();
    }, 3600000);

    // Log metrics every 5 minutes
    setInterval(() => {
      this.logMetrics();
    }, 300000);
  }

  /**
   * Record a trade execution
   */
  public recordTrade(success: boolean, amount: number, error?: string): void {
    const tradeRecord = {
      timestamp: new Date(),
      success,
      amount,
      error
    };

    this.tradeHistory.push(tradeRecord);
    this.updateTradeMetrics();

    // Emit event for real-time monitoring
    this.emit('tradeExecuted', tradeRecord);

    // Check for unusual trading patterns
    this.checkTradingPatterns();
  }

  /**
   * Record an API call
   */
  public recordApiCall(success: boolean, responseTime: number): void {
    const apiRecord = {
      timestamp: new Date(),
      success,
      responseTime
    };

    this.apiCallHistory.push(apiRecord);
    this.updateApiMetrics();

    // Emit event for real-time monitoring
    this.emit('apiCall', apiRecord);
  }

  /**
   * Record a security event
   */
  public recordSecurityEvent(event: SecurityEvent): void {
    this.securityEventHistory.push(event);
    this.metrics.securityEvents = this.securityEventHistory.slice(-100); // Keep last 100 events

    // Emit event for real-time monitoring
    this.emit('securityEvent', event);

    // Check for security threats
    this.checkSecurityThreats();
  }

  /**
   * Update position information
   */
  public updatePositions(positions: Position[]): void {
    this.positions = positions;
    this.updateRiskMetrics();
  }

  /**
   * Get current metrics
   */
  public getMetrics(): MonitoringMetrics {
    return { ...this.metrics };
  }

  /**
   * Get health status
   */
  public getHealthStatus(): {
    status: 'healthy' | 'warning' | 'critical';
    issues: string[];
    recommendations: string[];
  } {
    const issues: string[] = [];
    const recommendations: string[] = [];

    // Check error rate
    if (this.metrics.errorRate > 0.1) {
      issues.push('High error rate detected');
      recommendations.push('Investigate recent errors and check system stability');
    }

    // Check memory usage
    if (this.metrics.memoryUsage.heapUsed / this.metrics.memoryUsage.heapTotal > 0.9) {
      issues.push('High memory usage detected');
      recommendations.push('Consider restarting the application or optimizing memory usage');
    }

    // Check API response times
    const recentApiCalls = this.apiCallHistory.filter(
      call => Date.now() - call.timestamp.getTime() < 300000 // Last 5 minutes
    );
    const avgResponseTime = recentApiCalls.reduce((sum, call) => sum + call.responseTime, 0) / recentApiCalls.length;
    
    if (avgResponseTime > 5000) {
      issues.push('Slow API response times');
      recommendations.push('Check network connectivity and API server status');
    }

    // Check security events
    const recentSecurityEvents = this.securityEventHistory.filter(
      event => Date.now() - event.timestamp.getTime() < 3600000 // Last hour
    );
    const criticalEvents = recentSecurityEvents.filter(event => event.severity === 'critical');
    
    if (criticalEvents.length > 0) {
      issues.push('Critical security events detected');
      recommendations.push('Immediate security review required');
    }

    // Determine overall status
    let status: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (issues.length > 0) {
      status = criticalEvents.length > 0 ? 'critical' : 'warning';
    }

    return { status, issues, recommendations };
  }

  private updateSystemMetrics(): void {
    this.metrics.systemUptime = Date.now() - this.startTime.getTime();
    this.metrics.memoryUsage = process.memoryUsage();
    
    // Calculate CPU usage (simplified)
    const cpuUsage = process.cpuUsage();
    this.metrics.cpuUsage = (cpuUsage.user + cpuUsage.system) / 1000000; // Convert to seconds
  }

  private updateTradeMetrics(): void {
    this.metrics.totalTrades = this.tradeHistory.length;
    this.metrics.successfulTrades = this.tradeHistory.filter(t => t.success).length;
    this.metrics.failedTrades = this.tradeHistory.filter(t => !t.success).length;
    this.metrics.totalVolume = this.tradeHistory.reduce((sum, t) => sum + t.amount, 0);
    this.metrics.averageTradeSize = this.metrics.totalVolume / this.metrics.totalTrades || 0;
    this.metrics.errorRate = this.metrics.failedTrades / this.metrics.totalTrades || 0;

    const lastTrade = this.tradeHistory[this.tradeHistory.length - 1];
    if (lastTrade) {
      this.metrics.lastTradeTime = lastTrade.timestamp;
    }
  }

  private updateApiMetrics(): void {
    const recentCalls = this.apiCallHistory.filter(
      call => Date.now() - call.timestamp.getTime() < 60000 // Last minute
    );
    this.metrics.apiCallsPerMinute = recentCalls.length;
  }

  private updateRiskMetrics(): void {
    // Calculate total exposure
    this.metrics.riskMetrics.totalExposure = this.positions.reduce(
      (sum, pos) => sum + parseFloat(pos.amountIn), 0
    );

    // Calculate win rate
    const closedPositions = this.positions.filter(pos => pos.status === 'closed');
    if (closedPositions.length > 0) {
      const profitablePositions = closedPositions.filter(
        pos => parseFloat(pos.amountOut) > parseFloat(pos.amountIn)
      );
      this.metrics.riskMetrics.winRate = profitablePositions.length / closedPositions.length;

      // Calculate average win/loss
      const wins = closedPositions.filter(pos => parseFloat(pos.amountOut) > parseFloat(pos.amountIn));
      const losses = closedPositions.filter(pos => parseFloat(pos.amountOut) <= parseFloat(pos.amountIn));
      
      this.metrics.riskMetrics.averageWin = wins.length > 0 
        ? wins.reduce((sum, pos) => sum + (parseFloat(pos.amountOut) - parseFloat(pos.amountIn)), 0) / wins.length
        : 0;
      
      this.metrics.riskMetrics.averageLoss = losses.length > 0
        ? losses.reduce((sum, pos) => sum + (parseFloat(pos.amountIn) - parseFloat(pos.amountOut)), 0) / losses.length
        : 0;
    }
  }

  private checkTradingPatterns(): void {
    // Check for unusual trading frequency
    const recentTrades = this.tradeHistory.filter(
      trade => Date.now() - trade.timestamp.getTime() < 300000 // Last 5 minutes
    );

    if (recentTrades.length > 20) {
      const securityEvent: SecurityEvent = {
        type: 'trade_execution',
        severity: 'high',
        message: 'Unusual trading frequency detected',
        timestamp: new Date(),
        metadata: { tradeCount: recentTrades.length, timeWindow: '5 minutes' }
      };
      this.recordSecurityEvent(securityEvent);
    }
  }

  private checkSecurityThreats(): void {
    const recentEvents = this.securityEventHistory.filter(
      event => Date.now() - event.timestamp.getTime() < 3600000 // Last hour
    );

    const failedAuthAttempts = recentEvents.filter(
      event => event.type === 'authentication' && event.severity === 'high'
    );

    if (failedAuthAttempts.length > 5) {
      const securityEvent: SecurityEvent = {
        type: 'authorization',
        severity: 'critical',
        message: 'Multiple failed authentication attempts detected',
        timestamp: new Date(),
        metadata: { failedAttempts: failedAuthAttempts.length }
      };
      this.recordSecurityEvent(securityEvent);
    }
  }

  private cleanupHistory(): void {
    const oneDayAgo = Date.now() - 86400000; // 24 hours

    this.tradeHistory = this.tradeHistory.filter(
      trade => trade.timestamp.getTime() > oneDayAgo
    );

    this.apiCallHistory = this.apiCallHistory.filter(
      call => call.timestamp.getTime() > oneDayAgo
    );

    this.securityEventHistory = this.securityEventHistory.filter(
      event => event.timestamp.getTime() > oneDayAgo
    );
  }

  private logMetrics(): void {
    appLogger.logPerformance('System metrics', 0, this.metrics);
  }
}

// Export singleton instance
export const monitoringSystem = MonitoringSystem.getInstance();
