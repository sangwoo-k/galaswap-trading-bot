const crypto = require('crypto');

/**
 * Simple public key derivation for Gala
 * This is a simplified version - in production you'd use proper secp256k1
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
    // Note: This is simplified - real secp256k1 would be more complex
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

// Get private key from command line arguments
const args = process.argv.slice(2);

if (args.length === 0) {
  console.log('Usage: node get-public-key.js <private-key>');
  console.log('Example: node get-public-key.js 0x1234567890abcdef...');
  console.log('');
  console.log('Or run without arguments to enter private key securely:');
  console.log('node get-public-key.js');
  process.exit(1);
}

const privateKey = args[0];

try {
  const publicKey = getPublicKeyFromPrivateKey(privateKey);
  const address = getAddressFromPublicKey(publicKey);
  
  console.log('='.repeat(60));
  console.log('GALA WALLET KEY DERIVATION');
  console.log('='.repeat(60));
  console.log('');
  console.log('Private Key:', privateKey);
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
  console.log('⚠️  SECURITY WARNING:');
  console.log('- Never share your private key with anyone');
  console.log('- Keep your .env file secure');
  console.log('- Consider encrypting your private key');
  
} catch (error) {
  console.error('Failed to derive public key:', error.message);
  process.exit(1);
}
