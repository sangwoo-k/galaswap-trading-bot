const crypto = require('crypto');

console.log('='.repeat(60));
console.log('GENERATING SECURITY KEYS FOR YOUR TRADING BOT');
console.log('='.repeat(60));
console.log('');

// Generate JWT Secret (64 characters)
const jwtSecret = crypto.randomBytes(32).toString('hex');
console.log('JWT_SECRET=' + jwtSecret);
console.log('');

// Generate Encryption Key (32 characters)
const encryptionKey = crypto.randomBytes(16).toString('hex');
console.log('ENCRYPTION_KEY=' + encryptionKey);
console.log('');

console.log('='.repeat(60));
console.log('ADD THESE TO YOUR .env FILE:');
console.log('='.repeat(60));
console.log(`JWT_SECRET=${jwtSecret}`);
console.log(`ENCRYPTION_KEY=${encryptionKey}`);
console.log('='.repeat(60));
console.log('');

console.log('⚠️  SECURITY WARNING:');
console.log('- Keep these keys secure and never share them');
console.log('- Store them safely - you cannot recover them if lost');
console.log('- Use different keys for production vs development');
console.log('');

console.log('✅ Your GALA_PUBLIC_KEY is already configured:');
console.log('GALA_PUBLIC_KEY=a2e5f1ca115a5e4db2c4688f156ff9dfee0bcfc982f8993bb3876cd3c95387e5');
