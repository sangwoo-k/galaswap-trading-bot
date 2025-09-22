# GalaSwap Trading Bot

A secure, production-ready trading bot for swap.gala.com with comprehensive security features, risk management, and monitoring capabilities.

## 🚀 Features

### Security
- **End-to-end encryption** for sensitive data
- **JWT-based authentication** with secure token management
- **Rate limiting** and **circuit breakers** to prevent abuse
- **Input validation** and **sanitization** to prevent injection attacks
- **Comprehensive audit logging** for all operations
- **Security event monitoring** with real-time alerts

### Trading Strategies
- **Arbitrage Strategy**: Identifies and executes profitable arbitrage opportunities
- **Momentum Strategy**: Trades based on price momentum and volume analysis
- **Risk Management**: Built-in stop-loss, take-profit, and position sizing
- **Real-time monitoring** of all positions and trades

### Monitoring & Logging
- **Comprehensive logging** with multiple log levels and file rotation
- **Real-time monitoring** of system health and performance
- **Security event tracking** with severity-based alerting
- **Performance metrics** and risk analytics
- **Health check endpoints** for system status

### API & Management
- **RESTful API** for strategy management and monitoring
- **Real-time strategy control** (enable/disable/configure)
- **Position tracking** and performance analytics
- **Error handling** with automatic recovery mechanisms

## 🛠️ Installation

### Prerequisites
- Node.js 18.0.0 or higher
- npm or yarn package manager
- Gala wallet with private key access

### Setup

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd galaswap-trading-bot
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Configure environment variables**
   ```bash
   cp env.example .env
   ```
   
   Edit `.env` with your configuration:
   ```env
   # GalaSwap API Configuration
   GALA_WALLET_ADDRESS=your_gala_wallet_address
   GALA_PRIVATE_KEY=your_private_key_encrypted
   GALA_PUBLIC_KEY=your_public_key
   
   # Security Configuration
   JWT_SECRET=your_jwt_secret_key
   ENCRYPTION_KEY=your_32_character_encryption_key
   
   # Trading Configuration
   MAX_TRADE_AMOUNT=1000
   STOP_LOSS_PERCENTAGE=5
   TAKE_PROFIT_PERCENTAGE=10
   ```

4. **Build the project**
   ```bash
   npm run build
   ```

5. **Start the trading bot**
   ```bash
   npm start
   ```

## 🔧 Configuration

### Environment Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `GALA_WALLET_ADDRESS` | Your Gala wallet address | Yes | - |
| `GALA_PRIVATE_KEY` | Your encrypted private key | Yes | - |
| `GALA_PUBLIC_KEY` | Your public key | Yes | - |
| `JWT_SECRET` | Secret key for JWT tokens | Yes | - |
| `ENCRYPTION_KEY` | 32-character encryption key | Yes | - |
| `MAX_TRADE_AMOUNT` | Maximum trade amount | No | 1000 |
| `STOP_LOSS_PERCENTAGE` | Stop loss percentage | No | 5 |
| `TAKE_PROFIT_PERCENTAGE` | Take profit percentage | No | 10 |
| `LOG_LEVEL` | Logging level | No | info |
| `PORT` | Server port | No | 3000 |

### Strategy Configuration

#### Arbitrage Strategy
- `minProfitThreshold`: Minimum profit percentage (default: 0.5%)
- `maxTradeAmount`: Maximum trade amount (default: 1000)
- `cooldownPeriod`: Cooldown between trades (default: 60000ms)

#### Momentum Strategy
- `momentumThreshold`: Momentum threshold (default: 2.0%)
- `maxPositionSize`: Maximum position size (default: 500)
- `stopLossPercentage`: Stop loss percentage (default: 5.0%)
- `takeProfitPercentage`: Take profit percentage (default: 10.0%)

## 📊 API Endpoints

### Health & Monitoring
- `GET /health` - System health status
- `GET /metrics` - Performance metrics
- `GET /performance` - Strategy performance data

### Strategy Management
- `GET /strategies` - List all strategies
- `POST /strategies/:name/enable` - Enable a strategy
- `POST /strategies/:name/disable` - Disable a strategy
- `PUT /strategies/:name/parameters` - Update strategy parameters

### Trading Data
- `GET /positions` - Get all open positions
- `GET /performance` - Get performance metrics

## 🔒 Security Features

### Data Protection
- **AES-256-GCM encryption** for sensitive data
- **Secure key management** with environment variables
- **Input validation** and sanitization
- **SQL injection prevention**

### Authentication & Authorization
- **JWT-based authentication**
- **Rate limiting** per IP address
- **Request signing** for API calls
- **Unique key generation** to prevent replay attacks

### Monitoring & Alerting
- **Real-time security event monitoring**
- **Automated threat detection**
- **Comprehensive audit logging**
- **Performance monitoring** with alerts

## 🚨 Risk Management

### Position Management
- **Automatic stop-loss** and take-profit execution
- **Position sizing** based on risk parameters
- **Maximum exposure limits**
- **Real-time position monitoring**

### Error Handling
- **Circuit breakers** for failed operations
- **Automatic retry** with exponential backoff
- **Fallback mechanisms** for critical operations
- **Graceful degradation** under high load

## 📈 Monitoring

### Logs
- **Structured logging** with JSON format
- **Multiple log levels** (error, warn, info, debug)
- **Log rotation** with size limits
- **Separate log files** for different event types

### Metrics
- **Real-time performance metrics**
- **Trading statistics** and analytics
- **System health monitoring**
- **Security event tracking**

## 🛡️ Best Practices

### Security
1. **Never commit** private keys or secrets to version control
2. **Use strong encryption keys** (32+ characters)
3. **Regularly rotate** API keys and secrets
4. **Monitor security events** and respond to alerts
5. **Keep dependencies updated** for security patches

### Trading
1. **Start with small amounts** to test strategies
2. **Set appropriate stop-losses** to limit downside
3. **Monitor positions regularly** and adjust parameters
4. **Keep detailed logs** of all trading activities
5. **Test strategies** in a safe environment first

### Operations
1. **Monitor system health** regularly
2. **Set up alerts** for critical events
3. **Backup configuration** and logs
4. **Plan for disaster recovery**
5. **Document all changes** and deployments

## 🚀 Deployment

### Production Deployment
1. **Use a dedicated server** or VPS
2. **Set up SSL/TLS** for secure communication
3. **Configure firewalls** and network security
4. **Set up monitoring** and alerting systems
5. **Implement backup** and recovery procedures

### Docker Deployment
```dockerfile
FROM node:18-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
EXPOSE 3000
CMD ["npm", "start"]
```

## 📝 License

This project is licensed under the MIT License - see the LICENSE file for details.

## ⚠️ Disclaimer

This trading bot is for educational and research purposes. Trading cryptocurrencies involves substantial risk of loss and is not suitable for all investors. The high degree of leverage can work against you as well as for you. Before deciding to trade, you should carefully consider your investment objectives, level of experience, and risk appetite. The possibility exists that you could sustain a loss of some or all of your initial investment and therefore you should not invest money that you cannot afford to lose.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📞 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the logs for error details
