const express = require('express');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = 3001; // Different port from the trading bot

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Serve the dashboard
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        service: 'Trading Bot Dashboard',
        port: PORT,
        timestamp: new Date().toISOString()
    });
});

// Start the dashboard server
app.listen(PORT, () => {
    console.log('='.repeat(60));
    console.log('📊 TRADING BOT DASHBOARD STARTED');
    console.log('='.repeat(60));
    console.log(`🌐 Dashboard URL: http://localhost:${PORT}`);
    console.log(`🏥 Health Check: http://localhost:${PORT}/health`);
    console.log('='.repeat(60));
    console.log('');
    console.log('Dashboard Features:');
    console.log('  ✅ Real-time bot status monitoring');
    console.log('  ✅ Portfolio overview and metrics');
    console.log('  ✅ Risk assessment and alerts');
    console.log('  ✅ Strategy performance tracking');
    console.log('  ✅ Transaction history');
    console.log('  ✅ Bot control (start/stop)');
    console.log('  ✅ Auto-refresh capabilities');
    console.log('');
    console.log('Make sure your trading bot is running on port 3000');
    console.log('Press Ctrl+C to stop the dashboard');
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down dashboard gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down dashboard gracefully');
    process.exit(0);
});
