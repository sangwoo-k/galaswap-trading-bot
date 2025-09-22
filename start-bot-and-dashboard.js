const { spawn } = require('child_process');
const path = require('path');

console.log('='.repeat(60));
console.log('🚀 STARTING GALA SWAP TRADING BOT & DASHBOARD');
console.log('='.repeat(60));

// Start the trading bot
console.log('🤖 Starting Trading Bot...');
const botProcess = spawn('node', ['simple-bot.js'], {
    cwd: __dirname,
    stdio: 'inherit'
});

// Wait a moment for the bot to start
setTimeout(() => {
    console.log('📊 Starting Dashboard...');
    
    // Start the dashboard
    const dashboardProcess = spawn('node', ['server.js'], {
        cwd: path.join(__dirname, 'dashboard'),
        stdio: 'inherit'
    });

    // Handle process termination
    process.on('SIGINT', () => {
        console.log('\n🛑 Shutting down...');
        botProcess.kill('SIGINT');
        dashboardProcess.kill('SIGINT');
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        console.log('\n🛑 Shutting down...');
        botProcess.kill('SIGTERM');
        dashboardProcess.kill('SIGTERM');
        process.exit(0);
    });

    // Handle bot process exit
    botProcess.on('exit', (code) => {
        console.log(`🤖 Trading bot exited with code ${code}`);
        dashboardProcess.kill('SIGINT');
        process.exit(code);
    });

    // Handle dashboard process exit
    dashboardProcess.on('exit', (code) => {
        console.log(`📊 Dashboard exited with code ${code}`);
        botProcess.kill('SIGINT');
        process.exit(code);
    });

}, 3000); // Wait 3 seconds for bot to start

// Handle bot process exit
botProcess.on('exit', (code) => {
    console.log(`🤖 Trading bot exited with code ${code}`);
    process.exit(code);
});

console.log('');
console.log('📋 Services Starting:');
console.log('  🤖 Trading Bot: http://localhost:3000');
console.log('  📊 Dashboard: http://localhost:3001');
console.log('');
console.log('Press Ctrl+C to stop both services');
console.log('='.repeat(60));
