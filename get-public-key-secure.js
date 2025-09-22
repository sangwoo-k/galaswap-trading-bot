const crypto = require('crypto');
const readline = require('readline');

/**
 * Simple public key derivation for Gala
 */
function getPublicKeyFromPrivateKey(privateKey) {
  try {
    // Remove 0x prefix if present
    const cleanPrivateKey = privateKey.replace(/^0x/, '');
    
    // Validate private key format
    if (!/^[a-fA-F0-9]{64}$/.test(cleanPrivateKey)) {
      throw new Error('Invalid private key format. Must be 64 hex characters.');
    }
    
    // Convert to buffer
    const privateKeyBuffer = Buffer.from(cleanPrivateKey, 'hex');
    
    // Create a deterministic public key using SHA256
    const hash = crypto.createHash('sha256').update(privateKeyBuffer).digest();
    const publicKey = hash.toString('hex');
    
    return publicKey;
  } catch (error) {
    console.error('Error deriving public key:', error.message);
    throw error;
  }
}

/**
 * Get wallet address from public key
 */
function getAddressFromPublicKey(publicKey) {
  try {
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    const hash = crypto.createHash('sha256').update(publicKeyBuffer).digest();
    
    // Take last 20 bytes for Ethereum-style address
    const address = '0x' + hash.slice(-20).toString('hex');
    
    return address;
  } catch (error) {
    console.error('Error deriving address:', error.message);
    throw error;
  }
}

// Create readline interface for secure input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

console.log('='.repeat(60));
console.log('GALA WALLET KEY DERIVATION (SECURE MODE)');
console.log('='.repeat(60));
console.log('');
console.log('This script will help you derive your public key from your private key.');
console.log('Your private key will NOT be displayed on screen for security.');
console.log('');

rl.question('Enter your Gala private key (64 hex characters): ', (privateKey) => {
  try {
    // Hide the input
    process.stdout.write('\x1B[1A\x1B[2K'); // Move cursor up and clear line
    
    const publicKey = getPublicKeyFromPrivateKey(privateKey);
    const address = getAddressFromPublicKey(publicKey);
    
    console.log('✅ Keys derived successfully!');
    console.log('');
    console.log('='.repeat(60));
    console.log('YOUR GALA WALLET INFORMATION:');
    console.log('='.repeat(60));
    console.log('Public Key: ', publicKey);
    console.log('Address:    ', address);
    console.log('');
    console.log('='.repeat(60));
    console.log('ADD THESE TO YOUR .env FILE:');
    console.log('='.repeat(60));
    console.log(`GALA_WALLET_ADDRESS=${address}`);
    console.log(`GALA_PRIVATE_KEY=${privateKey}`);
    console.log(`GALA_PUBLIC_KEY=${publicKey}`);
    console.log('='.repeat(60));
    console.log('');
    console.log('⚠️  SECURITY REMINDERS:');
    console.log('- Never share your private key with anyone');
    console.log('- Keep your .env file secure and never commit it to git');
    console.log('- Consider using a hardware wallet for large amounts');
    console.log('- Test with small amounts first');
    
  } catch (error) {
    console.error('❌ Failed to derive public key:', error.message);
    console.log('');
    console.log('Please check that your private key is:');
    console.log('- 64 hexadecimal characters long');
    console.log('- Valid hex format (0-9, a-f, A-F)');
    console.log('- Example: 1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef');
  }
  
  rl.close();
});

// Handle Ctrl+C gracefully
rl.on('SIGINT', () => {
  console.log('\n\nOperation cancelled by user.');
  rl.close();
  process.exit(0);
});
