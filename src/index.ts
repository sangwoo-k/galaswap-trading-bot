import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { appConfig, securityConfig } from './config';
import { appLogger } from './utils/logger';
import { monitoringSystem } from './utils/monitoring';
import { errorHandler } from './utils/error-handler';
import { securityManager } from './utils/security';
import { ArbitrageStrategy } from './strategies/arbitrage-strategy';
import { MomentumStrategy } from './strategies/momentum-strategy';

class TradingBot {
  private app: express.Application;
  private strategies: Map<string, any> = new Map();
  private isRunning: boolean = false;

  constructor() {
    this.app = express();
    this.setupMiddleware();
    this.setupRoutes();
    this.setupStrategies();
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

    // Strategy management endpoints
    this.app.get('/strategies', (req, res) => {
      const strategies = Array.from(this.strategies.values()).map(strategy => strategy.getConfig());
      res.json({ strategies });
    });

    this.app.post('/strategies/:name/enable', (req, res) => {
      const strategyName = req.params.name;
      const strategy = this.strategies.get(strategyName);
      
      if (!strategy) {
        return res.status(404).json({ error: 'Strategy not found' });
      }

      strategy.setEnabled(true);
      res.json({ message: 'Strategy enabled', strategy: strategyName });
    });

    this.app.post('/strategies/:name/disable', (req, res) => {
      const strategyName = req.params.name;
      const strategy = this.strategies.get(strategyName);
      
      if (!strategy) {
        return res.status(404).json({ error: 'Strategy not found' });
      }

      strategy.setEnabled(false);
      res.json({ message: 'Strategy disabled', strategy: strategyName });
    });

    this.app.put('/strategies/:name/parameters', (req, res) => {
      const strategyName = req.params.name;
      const strategy = this.strategies.get(strategyName);
      
      if (!strategy) {
        return res.status(404).json({ error: 'Strategy not found' });
      }

      strategy.updateParameters(req.body);
      res.json({ message: 'Parameters updated', strategy: strategyName });
    });

    // Positions endpoint
    this.app.get('/positions', (req, res) => {
      const allPositions = Array.from(this.strategies.values())
        .flatMap(strategy => strategy.getPositions());
      res.json({ positions: allPositions });
    });

    // Performance endpoint
    this.app.get('/performance', (req, res) => {
      const performance = Array.from(this.strategies.values()).map(strategy => ({
        name: strategy.name,
        metrics: strategy.getPerformanceMetrics()
      }));
      res.json({ performance });
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

  private setupStrategies(): void {
    // Initialize arbitrage strategy
    const arbitrageStrategy = new ArbitrageStrategy({
      minProfitThreshold: 0.5,
      maxTradeAmount: 1000,
      cooldownPeriod: 60000
    });

    // Initialize momentum strategy
    const momentumStrategy = new MomentumStrategy({
      momentumThreshold: 2.0,
      maxPositionSize: 500,
      stopLossPercentage: 5.0,
      takeProfitPercentage: 10.0
    });

    this.strategies.set('arbitrage', arbitrageStrategy);
    this.strategies.set('momentum', momentumStrategy);

    // Set up strategy event listeners
    this.strategies.forEach((strategy, name) => {
      strategy.on('tradeExecuted', (data: any) => {
        appLogger.logTrade('strategy_trade', {
          strategy: name,
          ...data
        });
      });

      strategy.on('error', (error: Error) => {
        errorHandler.handleError(error, {
          operation: 'strategy_execution',
          strategy: name
        }).catch(() => {
          // Error already handled
        });
      });
    });
  }

  public async start(): Promise<void> {
    try {
      appLogger.logSystemEvent('Starting trading bot');

      // Initialize strategies
      for (const [name, strategy] of this.strategies) {
        await strategy.initialize();
        appLogger.logSystemEvent('Strategy initialized', { strategy: name });
      }

      // Start the server
      this.app.listen(appConfig.port, () => {
        appLogger.logSystemEvent('Trading bot started', {
          port: appConfig.port,
          environment: appConfig.nodeEnv
        });
      });

      // Start strategy execution loops
      this.startStrategyLoops();

      this.isRunning = true;

      // Record startup security event
      const securityEvent = securityManager.createSecurityEvent(
        'authentication',
        'low',
        'Trading bot started successfully',
        { port: appConfig.port, environment: appConfig.nodeEnv }
      );
      monitoringSystem.recordSecurityEvent(securityEvent);

    } catch (error) {
      appLogger.logError(error as Error, { operation: 'bot_startup' });
      throw error;
    }
  }

  private startStrategyLoops(): void {
    // Run strategies every 30 seconds
    setInterval(async () => {
      if (!this.isRunning) return;

      for (const [name, strategy] of this.strategies) {
        try {
          if (strategy.enabled) {
            await strategy.execute();
          }
        } catch (error) {
          errorHandler.handleError(error as Error, {
            operation: 'strategy_loop',
            strategy: name
          }).catch(() => {
            // Error already handled
          });
        }
      }
    }, 30000);

    // Update monitoring system with positions every minute
    setInterval(() => {
      if (!this.isRunning) return;

      const allPositions = Array.from(this.strategies.values())
        .flatMap(strategy => strategy.getPositions());
      monitoringSystem.updatePositions(allPositions);
    }, 60000);
  }

  public async stop(): Promise<void> {
    try {
      appLogger.logSystemEvent('Stopping trading bot');

      this.isRunning = false;

      // Stop all strategies
      for (const [name, strategy] of this.strategies) {
        await strategy.stop();
        appLogger.logSystemEvent('Strategy stopped', { strategy: name });
      }

      appLogger.logSystemEvent('Trading bot stopped');

    } catch (error) {
      appLogger.logError(error as Error, { operation: 'bot_shutdown' });
      throw error;
    }
  }

  public getStatus(): {
    isRunning: boolean;
    strategies: string[];
    uptime: number;
  } {
    return {
      isRunning: this.isRunning,
      strategies: Array.from(this.strategies.keys()),
      uptime: process.uptime()
    };
  }
}

// Create and start the trading bot
const tradingBot = new TradingBot();

// Graceful shutdown
process.on('SIGTERM', async () => {
  appLogger.logSystemEvent('SIGTERM received, shutting down gracefully');
  await tradingBot.stop();
  process.exit(0);
});

process.on('SIGINT', async () => {
  appLogger.logSystemEvent('SIGINT received, shutting down gracefully');
  await tradingBot.stop();
  process.exit(0);
});

// Start the bot
tradingBot.start().catch((error) => {
  appLogger.logError(error, { operation: 'bot_startup' });
  process.exit(1);
});

export default tradingBot;
