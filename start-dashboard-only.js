const { spawn } = require('child_process');
const path = require('path');

console.log('='.repeat(60));
console.log('📊 STARTING TRADING BOT DASHBOARD');
console.log('='.repeat(60));

console.log('📊 Starting Dashboard...');

// Start the dashboard
const dashboardProcess = spawn('node', ['server.js'], {
    cwd: path.join(__dirname, 'dashboard'),
    stdio: 'inherit'
});

// Handle process termination
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down dashboard...');
    dashboardProcess.kill('SIGINT');
    process.exit(0);
});

process.on('SIGTERM', () => {
    console.log('\n🛑 Shutting down dashboard...');
    dashboardProcess.kill('SIGTERM');
    process.exit(0);
});

// Handle dashboard process exit
dashboardProcess.on('exit', (code) => {
    console.log(`📊 Dashboard exited with code ${code}`);
    process.exit(code);
});

console.log('');
console.log('📋 Dashboard Starting:');
console.log('  📊 Dashboard: http://localhost:3001');
console.log('');
console.log('Make sure your trading bot is running on port 3000');
console.log('Press Ctrl+C to stop the dashboard');
console.log('='.repeat(60));
