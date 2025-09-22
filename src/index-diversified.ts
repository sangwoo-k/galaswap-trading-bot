import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { appConfig, securityConfig } from './config';
import { appLogger } from './utils/logger';
import { monitoringSystem } from './utils/monitoring';
import { errorHandler } from './utils/error-handler';
import { securityManager } from './utils/security';
import { portfolioManager } from './strategies/portfolio-manager';
import { riskManager } from './utils/risk-manager';
import { feeCalculator } from './utils/fee-calculator';

class DiversifiedTradingBot {
  private app: express.Application;
  private isRunning: boolean = false;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Security middleware
    this.app.use(helmet());
    
    // CORS configuration
    this.app.use(cors({
      origin: securityConfig.corsOrigin,
      credentials: true
    }));

    // Rate limiting
    const limiter = rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
      message: 'Too many requests from this IP, please try again later.',
      standardHeaders: true,
      legacyHeaders: false,
    });
    this.app.use(limiter);

    // Body parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Request logging
    this.app.use((req, res, next) => {
      appLogger.logSystemEvent('HTTP Request', {
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      });
      next();
    });
  }

  private setupRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      const health = monitoringSystem.getHealthStatus();
      res.json({
        status: health.status,
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        ...health
      });
    });

    // Metrics endpoint
    this.app.get('/metrics', (req, res) => {
      const metrics = monitoringSystem.getMetrics();
      res.json(metrics);
    });

    // Portfolio status
    this.app.get('/portfolio', (req, res) => {
      const portfolioStatus = portfolioManager.getPortfolioStatus();
      res.json(portfolioStatus);
    });

    // Risk metrics
    this.app.get('/risk', (req, res) => {
      const riskMetrics = riskManager.getRiskMetrics();
      res.json(riskMetrics);
    });

    // Strategy management endpoints
    this.app.get('/strategies', (req, res) => {
      const portfolioStatus = portfolioManager.getPortfolioStatus();
      res.json({ 
        strategies: portfolioStatus.strategies,
        totalValue: portfolioStatus.totalValue,
        isRunning: portfolioStatus.isRunning
      });
    });

    this.app.post('/strategies/:name/enable', (req, res) => {
      const strategyName = req.params.name;
      portfolioManager.updateAllocation(strategyName, { enabled: true });
      res.json({ message: 'Strategy enabled', strategy: strategyName });
    });

    this.app.post('/strategies/:name/disable', (req, res) => {
      const strategyName = req.params.name;
      portfolioManager.updateAllocation(strategyName, { enabled: false });
      res.json({ message: 'Strategy disabled', strategy: strategyName });
    });

    this.app.put('/strategies/:name/allocation', (req, res) => {
      const strategyName = req.params.name;
      const { allocation } = req.body;
      
      if (allocation < 0 || allocation > 100) {
        return res.status(400).json({ error: 'Allocation must be between 0 and 100' });
      }
      
      portfolioManager.updateAllocation(strategyName, { allocation });
      res.json({ message: 'Allocation updated', strategy: strategyName, allocation });
    });

    // Risk management endpoints
    this.app.get('/risk/limits', (req, res) => {
      const riskMetrics = riskManager.getRiskMetrics();
      res.json({ limits: riskMetrics.riskLimits });
    });

    this.app.put('/risk/limits', (req, res) => {
      const newLimits = req.body;
      riskManager.updateRiskLimits(newLimits);
      res.json({ message: 'Risk limits updated', limits: newLimits });
    });

    // Portfolio control endpoints
    this.app.post('/portfolio/start', (req, res) => {
      if (this.isRunning) {
        return res.json({ message: 'Portfolio is already running' });
      }
      
      this.start();
      res.json({ message: 'Portfolio started successfully!' });
    });

    this.app.post('/portfolio/stop', (req, res) => {
      if (!this.isRunning) {
        return res.json({ message: 'Portfolio is not running' });
      }
      
      this.stop();
      res.json({ message: 'Portfolio stopped successfully!' });
    });

    this.app.post('/portfolio/emergency-stop', (req, res) => {
      this.emergencyStop();
      res.json({ message: 'Emergency stop activated!' });
    });

    // Diversification endpoints
    this.app.get('/diversification', (req, res) => {
      const portfolioStatus = portfolioManager.getPortfolioStatus();
      const riskMetrics = riskManager.getRiskMetrics();
      
      res.json({
        diversification: {
          totalStrategies: portfolioStatus.strategies.length,
          activeStrategies: portfolioStatus.strategies.filter(s => s.enabled).length,
          riskDistribution: {
            low: portfolioStatus.strategies.filter(s => s.riskLevel === 'low').length,
            medium: portfolioStatus.strategies.filter(s => s.riskLevel === 'medium').length,
            high: portfolioStatus.strategies.filter(s => s.riskLevel === 'high').length
          },
          riskScore: riskMetrics.riskScore,
          recommendations: riskMetrics.recommendations
        }
      });
    });

    // Fee monitoring endpoints
    this.app.get('/fees', (req, res) => {
      const feeStats = feeCalculator.getFeeStatistics();
      res.json(feeStats);
    });

    this.app.get('/fees/validate', async (req, res) => {
      try {
        const { tokenIn, tokenOut, amountIn, expectedAmountOut, currentPrice } = req.query;
        
        if (!tokenIn || !tokenOut || !amountIn || !expectedAmountOut || !currentPrice) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }

        const validation = await feeCalculator.validateTransaction(
          tokenIn as string,
          tokenOut as string,
          amountIn as string,
          expectedAmountOut as string,
          parseFloat(currentPrice as string)
        );

        res.json(validation);
      } catch (error) {
        res.status(500).json({ error: 'Failed to validate transaction' });
      }
    });

    this.app.get('/fees/minimum', async (req, res) => {
      try {
        const { tokenIn, tokenOut, currentPrice } = req.query;
        
        if (!tokenIn || !tokenOut || !currentPrice) {
          return res.status(400).json({ error: 'Missing required parameters' });
        }

        const minimumAmount = await feeCalculator.calculateMinimumAmount(
          tokenIn as string,
          tokenOut as string,
          parseFloat(currentPrice as string)
        );

        res.json(minimumAmount);
      } catch (error) {
        res.status(500).json({ error: 'Failed to calculate minimum amount' });
      }
    });

    // Performance analytics
    this.app.get('/analytics', (req, res) => {
      const portfolioStatus = portfolioManager.getPortfolioStatus();
      const riskMetrics = riskManager.getRiskMetrics();
      
      res.json({
        portfolio: {
          totalValue: portfolioStatus.totalValue,
          totalPositions: portfolioStatus.strategies.reduce((sum, s) => sum + s.positions, 0),
          strategies: portfolioStatus.strategies.map(s => ({
            name: s.name,
            allocation: s.allocation,
            positions: s.positions,
            performance: s.performance
          }))
        },
        risk: {
          riskScore: riskMetrics.riskScore,
          dailyPnL: riskMetrics.portfolioMetrics.dailyPnL,
          maxDrawdown: riskMetrics.portfolioMetrics.maxDrawdown,
          winRate: riskMetrics.portfolioMetrics.winRate
        },
        recommendations: riskMetrics.recommendations
      });
    });

    // Error handling middleware
    this.app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
      errorHandler.handleError(err, {
        operation: 'http_request',
        requestId: req.headers['x-request-id'] as string,
        additionalData: {
          method: req.method,
          url: req.url,
          body: req.body
        }
      }).catch(() => {
        // Error already logged by error handler
      });

      res.status(500).json({
        error: 'Internal server error',
        message: appConfig.nodeEnv === 'development' ? err.message : 'Something went wrong'
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  public async start(): Promise<void> {
    try {
      appLogger.logSystemEvent('Starting diversified trading bot');

      // Start portfolio manager
      await portfolioManager.start();

      // Start the server
      this.app.listen(appConfig.port, () => {
        appLogger.logSystemEvent('Diversified trading bot started', {
          port: appConfig.port,
          environment: appConfig.nodeEnv
        });
      });

      this.isRunning = true;

      // Record startup security event
      const securityEvent = securityManager.createSecurityEvent(
        'authentication',
        'low',
        'Diversified trading bot started successfully',
        { port: appConfig.port, environment: appConfig.nodeEnv }
      );
      monitoringSystem.recordSecurityEvent(securityEvent);

    } catch (error) {
      appLogger.logError(error as Error, { operation: 'bot_startup' });
      throw error;
    }
  }

  public async stop(): Promise<void> {
    try {
      appLogger.logSystemEvent('Stopping diversified trading bot');

      this.isRunning = false;

      // Stop portfolio manager
      await portfolioManager.stop();

      appLogger.logSystemEvent('Diversified trading bot stopped');

    } catch (error) {
      appLogger.logError(error as Error, { operation: 'bot_shutdown' });
      throw error;
    }
  }

  private async emergencyStop(): Promise<void> {
    try {
      appLogger.logSystemEvent('EMERGENCY STOP ACTIVATED');

      this.isRunning = false;
      await portfolioManager.stop();

      // Record emergency stop event
      const securityEvent = securityManager.createSecurityEvent(
        'error',
        'critical',
        'Emergency stop activated',
        { timestamp: new Date().toISOString() }
      );
      monitoringSystem.recordSecurityEvent(securityEvent);

    } catch (error) {
      appLogger.logError(error as Error, { operation: 'emergency_stop' });
    }
  }

  public getStatus(): {
    isRunning: boolean;
    uptime: number;
    strategies: string[];
    totalValue: number;
  } {
    const portfolioStatus = portfolioManager.getPortfolioStatus();
    
    return {
      isRunning: this.isRunning,
      uptime: process.uptime(),
      strategies: portfolioStatus.strategies.map(s => s.name),
      totalValue: portfolioStatus.totalValue
    };
  }
}

// Create and start the diversified trading bot
const diversifiedTradingBot = new DiversifiedTradingBot();

// Graceful shutdown
process.on('SIGTERM', async () => {
  appLogger.logSystemEvent('SIGTERM received, shutting down gracefully');
  await diversifiedTradingBot.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  appLogger.logSystemEvent('SIGINT received, shutting down gracefully');
  await diversifiedTradingBot.stop();
  process.exit(0);
});

// Start the bot
diversifiedTradingBot.start().catch((error) => {
  appLogger.logError(error, { operation: 'bot_startup' });
  process.exit(1);
});

export default diversifiedTradingBot;
