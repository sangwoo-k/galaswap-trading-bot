const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const path = require('path');
const fs = require('fs');

// Create logs directory
const logDir = './logs';
if (!fs.existsSync(logDir)) {
  fs.mkdirSync(logDir, { recursive: true });
}

// Create logger
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: './logs/trading-bot.log' }),
    new winston.transports.Console({
      format: winston.format.simple()
    })
  ]
});

class SimpleTradingBot {
  constructor() {
    this.app = express();
    this.isRunning = false;
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(helmet());
    this.app.use(cors());
    
    const limiter = rateLimit({
      windowMs: 1 * 60 * 1000, // 1 minute
      max: 60 // limit each IP to 60 requests per minute
    });
    this.app.use(limiter);
    
    this.app.use(express.json());
  }

  setupRoutes() {
    // Health check
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        message: 'GalaSwap Trading Bot is running!'
      });
    });

    // Bot status
    this.app.get('/status', (req, res) => {
      res.json({
        isRunning: this.isRunning,
        strategies: ['arbitrage', 'momentum'],
        uptime: process.uptime(),
        environment: process.env.NODE_ENV || 'development'
      });
    });

    // Start bot
    this.app.post('/start', (req, res) => {
      if (this.isRunning) {
        return res.json({ message: 'Bot is already running' });
      }
      
      this.start();
      res.json({ message: 'Trading bot started successfully!' });
    });

    // Stop bot
    this.app.post('/stop', (req, res) => {
      if (!this.isRunning) {
        return res.json({ message: 'Bot is not running' });
      }
      
      this.stop();
      res.json({ message: 'Trading bot stopped successfully!' });
    });

    // Get configuration
    this.app.get('/config', (req, res) => {
      res.json({
        galaPublicKey: process.env.GALA_PUBLIC_KEY || 'Not configured',
        maxTradeAmount: process.env.MAX_TRADE_AMOUNT || '1000',
        stopLossPercentage: process.env.STOP_LOSS_PERCENTAGE || '5',
        takeProfitPercentage: process.env.TAKE_PROFIT_PERCENTAGE || '10',
        nodeEnv: process.env.NODE_ENV || 'development'
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  start() {
    this.isRunning = true;
    logger.info('Trading bot started', {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development'
    });

    // Simulate trading activity (in a real bot, this would be actual trading logic)
    this.tradingInterval = setInterval(() => {
      if (this.isRunning) {
        logger.info('Trading bot is active', {
          timestamp: new Date().toISOString(),
          status: 'running'
        });
      }
    }, 30000); // Log every 30 seconds
  }

  stop() {
    this.isRunning = false;
    if (this.tradingInterval) {
      clearInterval(this.tradingInterval);
    }
    logger.info('Trading bot stopped', {
      timestamp: new Date().toISOString()
    });
  }

  listen(port = 3000) {
    this.app.listen(port, () => {
      logger.info(`GalaSwap Trading Bot listening on port ${port}`, {
        port,
        environment: process.env.NODE_ENV || 'development'
      });
      
      console.log('='.repeat(60));
      console.log('🚀 GALA SWAP TRADING BOT STARTED');
      console.log('='.repeat(60));
      console.log(`📡 Server running on: http://localhost:${port}`);
      console.log(`🏥 Health check: http://localhost:${port}/health`);
      console.log(`📊 Status: http://localhost:${port}/status`);
      console.log(`⚙️  Config: http://localhost:${port}/config`);
      console.log('='.repeat(60));
      console.log('');
      console.log('Available endpoints:');
      console.log('  GET  /health  - Health check');
      console.log('  GET  /status  - Bot status');
      console.log('  POST /start   - Start trading');
      console.log('  POST /stop    - Stop trading');
      console.log('  GET  /config  - View configuration');
      console.log('');
      console.log('Press Ctrl+C to stop the bot');
    });
  }
}

// Create and start the bot
const bot = new SimpleTradingBot();

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  bot.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  bot.stop();
  process.exit(0);
});

// Start the bot
const port = process.env.PORT || 3000;
bot.listen(port);

module.exports = bot;
