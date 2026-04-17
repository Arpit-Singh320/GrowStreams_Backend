import { Router } from 'express';
import { command as sailsCommand, getContract } from '../sails-client.mjs';

const router = Router();

// Test endpoint to verify on-chain minting works
router.post('/test-mint', async (req, res, next) => {
  try {
    const { wallet } = req.body;
    
    if (!wallet) {
      return res.status(400).json({ error: 'wallet required' });
    }

    const seedsContract = getContract('questSeeds');
    if (!seedsContract) {
      return res.status(500).json({ error: 'questSeeds contract not loaded' });
    }

    // Convert wallet to hex if needed
    let walletHex = wallet;
    if (!wallet.startsWith('0x')) {
      const { decodeAddress } = await import('@polkadot/util-crypto');
      const publicKey = decodeAddress(wallet);
      walletHex = '0x' + Buffer.from(publicKey).toString('hex');
      console.log(`[test-mint] Converted SS58 ${wallet} to hex ${walletHex}`);
    }

    console.log(`[test-mint] Attempting to mint 1 test Seeds to ${walletHex}`);
    
    const mintResult = await sailsCommand('questSeeds', 'Mint', walletHex, 1, 'test:api-verification');
    
    console.log(`[test-mint] SUCCESS! Block hash: ${mintResult.blockHash}`);
    
    res.json({
      success: true,
      wallet: wallet,
      walletHex: walletHex,
      amount: 1,
      reason: 'test:api-verification',
      blockHash: mintResult.blockHash,
      message: 'Test mint successful! Check VARA Idea portal to verify on-chain.',
      varaIdeaLink: `https://idea.gear-tech.io/programs/0xf12f4e2c2e6f4f38a958d693caebb4ed77012d729fde0496dc432fa3e66a8241?node=wss://testnet.vara.network`
    });

  } catch (err) {
    console.error(`[test-mint] Failed:`, err);
    res.status(500).json({ 
      error: err.message,
      details: 'Check server logs for full error'
    });
  }
});

export default router;
