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
    this.riskScore = 50; // Default risk score
    this.tradingFrequency = 30000; // 30 seconds default
    this.positionSizeMultiplier = 1.0; // Default position size
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
        nodeEnv: process.env.NODE_ENV || 'development',
        riskScore: this.riskScore,
        tradingFrequency: this.tradingFrequency,
        positionSizeMultiplier: this.positionSizeMultiplier
      });
    });

    // Update risk score
    this.app.post('/risk/update', (req, res) => {
      const { riskScore } = req.body;
      
      if (typeof riskScore !== 'number' || riskScore < 10 || riskScore > 80) {
        return res.status(400).json({ 
          error: 'Risk score must be a number between 10 and 80' 
        });
      }
      
      this.riskScore = riskScore;
      
      // Update trading parameters based on risk score
      this.updateTradingParameters();
      
      logger.info(`Risk score updated to ${riskScore}`, { 
        riskScore, 
        tradingFrequency: this.tradingFrequency,
        positionSizeMultiplier: this.positionSizeMultiplier 
      });
      
      res.json({ 
        message: 'Risk score updated successfully',
        riskScore: this.riskScore,
        tradingFrequency: this.tradingFrequency,
        positionSizeMultiplier: this.positionSizeMultiplier
      });
    });

    // Get current risk settings
    this.app.get('/risk/current', (req, res) => {
      res.json({
        riskScore: this.riskScore,
        tradingFrequency: this.tradingFrequency,
        positionSizeMultiplier: this.positionSizeMultiplier,
        isRunning: this.isRunning
      });
    });

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({ error: 'Endpoint not found' });
    });
  }

  updateTradingParameters() {
    // Update trading frequency based on risk score
    if (this.riskScore <= 30) {
      // Conservative: slower trading
      this.tradingFrequency = 60000; // 1 minute
      this.positionSizeMultiplier = 0.5; // Smaller positions
    } else if (this.riskScore <= 60) {
      // Moderate: balanced trading
      this.tradingFrequency = 30000; // 30 seconds
      this.positionSizeMultiplier = 1.0; // Normal positions
    } else {
      // Aggressive: faster trading
      this.tradingFrequency = 15000; // 15 seconds
      this.positionSizeMultiplier = 1.5; // Larger positions
    }
    
    // Restart trading interval if bot is running
    if (this.isRunning && this.tradingInterval) {
      clearInterval(this.tradingInterval);
      this.tradingInterval = setInterval(() => {
        if (this.isRunning) {
          this.executeTradingCycle();
        }
      }, this.tradingFrequency);
    }
  }

  executeTradingCycle() {
    // Simulate trading decision based on risk score
    const shouldTrade = Math.random() < (this.riskScore / 100);
    
    if (shouldTrade) {
      const positionSize = 100 * this.positionSizeMultiplier;
      logger.info('Trading opportunity detected', { 
        riskScore: this.riskScore,
        positionSize: positionSize,
        tradingFrequency: this.tradingFrequency,
        timestamp: new Date().toISOString()
      });
    } else {
      logger.info('Trading bot is active - monitoring markets', { 
        riskScore: this.riskScore,
        status: 'monitoring',
        timestamp: new Date().toISOString()
      });
    }
  }

  start() {
    this.isRunning = true;
    logger.info('Trading bot started', {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      riskScore: this.riskScore,
      tradingFrequency: this.tradingFrequency
    });

    // Start trading cycle with current risk settings
    this.tradingInterval = setInterval(() => {
      if (this.isRunning) {
        this.executeTradingCycle();
      }
    }, this.tradingFrequency);
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
