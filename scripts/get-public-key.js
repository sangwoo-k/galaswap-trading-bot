const crypto = require('crypto');
const secp256k1 = require('secp256k1');

/**
 * Derive public key from private key
 * @param {string} privateKey - Private key in hex format (with or without 0x prefix)
 * @returns {string} - Public key in hex format
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
    
    // Derive public key using secp256k1
    const publicKeyBuffer = secp256k1.publicKeyCreate(privateKeyBuffer);
    
    // Convert to hex string
    const publicKey = publicKeyBuffer.toString('hex');
    
    return publicKey;
  } catch (error) {
    console.error('Error deriving public key:', error.message);
    throw error;
  }
}

/**
 * Get wallet address from public key
 * @param {string} publicKey - Public key in hex format
 * @returns {string} - Ethereum-style wallet address
 */
function getAddressFromPublicKey(publicKey) {
  try {
    const publicKeyBuffer = Buffer.from(publicKey, 'hex');
    
    // Remove the first byte (0x04) if present (uncompressed public key)
    const keyBuffer = publicKeyBuffer.length === 65 ? publicKeyBuffer.slice(1) : publicKeyBuffer;
    
    // Hash with keccak256
    const hash = crypto.createHash('sha3-256').update(keyBuffer).digest();
    
    // Take last 20 bytes and convert to address
    const address = '0x' + hash.slice(-20).toString('hex');
    
    return address;
  } catch (error) {
    console.error('Error deriving address:', error.message);
    throw error;
  }
}

// Example usage
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length === 0) {
    console.log('Usage: node get-public-key.js <private-key>');
    console.log('Example: node get-public-key.js 0x1234567890abcdef...');
    process.exit(1);
  }
  
  const privateKey = args[0];
  
  try {
    const publicKey = getPublicKeyFromPrivateKey(privateKey);
    const address = getAddressFromPublicKey(publicKey);
    
    console.log('Private Key:', privateKey);
    console.log('Public Key:', publicKey);
    console.log('Wallet Address:', address);
    
    console.log('\nFor your .env file:');
    console.log(`GALA_PUBLIC_KEY=${publicKey}`);
    console.log(`GALA_WALLET_ADDRESS=${address}`);
    
  } catch (error) {
    console.error('Failed to derive public key:', error.message);
    process.exit(1);
  }
}

module.exports = {
  getPublicKeyFromPrivateKey,
  getAddressFromPublicKey
};
