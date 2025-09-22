# GalaSwap Trading Bot Dashboard

A real-time web dashboard for monitoring your GalaSwap Trading Bot's status, performance, and transactions.

## 🚀 Features

### Real-Time Monitoring
- **Bot Status**: Online/offline status with uptime tracking
- **Portfolio Overview**: Total value, positions, daily P&L, win rate
- **Risk Metrics**: Risk score, drawdown, exposure, active strategies
- **Strategy Performance**: Individual strategy status and allocation

### Interactive Controls
- **Start/Stop Bot**: Control your trading bot directly from the dashboard
- **Auto Refresh**: Automatic data updates every 5 seconds
- **Manual Refresh**: Force refresh data on demand
- **Strategy Management**: View and monitor all trading strategies

### Visual Interface
- **Modern Design**: Clean, responsive interface with gradient backgrounds
- **Status Indicators**: Color-coded status indicators for quick assessment
- **Real-Time Updates**: Live data without page refreshes
- **Mobile Friendly**: Responsive design works on all devices

## 🛠️ Installation & Setup

### Prerequisites
- Node.js 14.0.0 or higher
- Your GalaSwap Trading Bot running on port 3000

### Quick Start

1. **Navigate to dashboard directory**
   ```bash
   cd dashboard
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Start the dashboard**
   ```bash
   npm start
   ```

4. **Open your browser**
   ```
   http://localhost:3001
   ```

## 📊 Dashboard Sections

### 1. Bot Status Card
- **Status Indicator**: Green (online), Red (offline), Orange (warning)
- **Uptime**: How long the bot has been running
- **Environment**: Development/Production mode
- **Last Update**: When data was last refreshed

### 2. Portfolio Overview
- **Total Value**: Current portfolio value in USD
- **Total Positions**: Number of active trading positions
- **Daily P&L**: Profit/Loss for the current day
- **Win Rate**: Percentage of profitable trades

### 3. Risk Metrics
- **Risk Score**: Overall risk assessment (0-100)
- **Max Drawdown**: Maximum loss from peak value
- **Total Exposure**: Total amount at risk
- **Active Strategies**: Number of enabled strategies

### 4. Trading Strategies
- **Strategy Grid**: Visual overview of all strategies
- **Allocation**: Percentage of portfolio allocated to each strategy
- **Risk Level**: Low/Medium/High risk classification
- **Positions**: Number of active positions per strategy

### 5. Recent Transactions
- **Transaction History**: Recent trading activity
- **Status Indicators**: Success/Error status for each transaction
- **Timestamps**: When each transaction occurred
- **Details**: Transaction-specific information

## 🎮 Controls

### Bot Management
- **Start Bot**: Begin trading operations
- **Stop Bot**: Halt all trading activities
- **Refresh**: Manually update all data
- **Auto Refresh**: Toggle automatic updates (every 5 seconds)

### Real-Time Features
- **Live Updates**: Data refreshes automatically
- **Status Monitoring**: Continuous health checks
- **Alert System**: Visual indicators for issues
- **Performance Tracking**: Real-time metrics

## 🔧 Configuration

### Port Configuration
- **Dashboard Port**: 3001 (default)
- **Bot API Port**: 3000 (must match your bot configuration)

### API Endpoints
The dashboard connects to these bot endpoints:
- `GET /health` - Bot health status
- `GET /portfolio` - Portfolio overview
- `GET /risk` - Risk metrics
- `GET /strategies` - Strategy information
- `POST /portfolio/start` - Start bot
- `POST /portfolio/stop` - Stop bot

### Customization
You can modify the dashboard by editing:
- `index.html` - Frontend interface and styling
- `server.js` - Backend server configuration
- CSS styles - Visual appearance and layout

## 🚨 Troubleshooting

### Common Issues

**Dashboard shows "Bot Offline"**
- Ensure your trading bot is running on port 3000
- Check if the bot's API endpoints are accessible
- Verify firewall settings allow local connections

**No data displayed**
- Confirm the bot is running and responding to API calls
- Check browser console for JavaScript errors
- Ensure CORS is properly configured

**Auto refresh not working**
- Check if the toggle is enabled (should show "ON")
- Verify the bot API is responding
- Look for network errors in browser developer tools

### Debug Mode
Enable debug logging by opening browser developer tools (F12) and checking the console for error messages.

## 📱 Mobile Access

The dashboard is fully responsive and works on:
- **Desktop**: Full feature set with optimal layout
- **Tablet**: Adapted layout with touch-friendly controls
- **Mobile**: Compact view with essential information

## 🔒 Security Notes

- The dashboard runs locally and only connects to your local bot
- No sensitive data is transmitted over the internet
- All API calls are made to localhost only
- Private keys and sensitive information are never displayed

## 🚀 Advanced Usage

### Multiple Bots
To monitor multiple bots, you can:
1. Run multiple dashboard instances on different ports
2. Modify the `BOT_API_URL` in the HTML file
3. Use different bot configurations

### Custom Metrics
Add custom metrics by:
1. Modifying the bot's API endpoints
2. Updating the dashboard's JavaScript functions
3. Adding new cards to the dashboard grid

### Integration
The dashboard can be integrated with:
- **Monitoring Systems**: Prometheus, Grafana
- **Alerting**: Slack, Discord, Email notifications
- **Logging**: Centralized logging systems

## 📈 Performance

- **Lightweight**: Minimal resource usage
- **Fast Updates**: 5-second refresh intervals
- **Efficient**: Only fetches necessary data
- **Responsive**: Smooth animations and transitions

## 🤝 Support

For issues or questions:
1. Check the troubleshooting section
2. Review the bot's API documentation
3. Check browser console for errors
4. Verify network connectivity

## 📄 License

MIT License - Feel free to modify and distribute as needed.

---

**Happy Trading! 🚀**
