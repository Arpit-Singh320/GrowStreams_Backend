import { Router } from 'express';
import { getApi, getKeyring, getProgramIds } from '../sails-client.mjs';
import { getRelayerBalance, getEscrowInfo } from '../vara-eth-client.mjs';

const router = Router();

router.get('/', async (req, res) => {
  const api = getApi();
  const keyring = getKeyring();
  let balance = null;

  try {
    if (api && keyring) {
      const { data: { free } } = await api.query.system.account(keyring.address);
      balance = (Number(BigInt(free.toString())) / 1e12).toFixed(4) + ' VARA';
    }
  } catch {}

  let stats = null;
  if (api && api.isConnected) {
    try {
      const { query } = await import('../sails-client.mjs');
      const total = await query('streamCore', 'TotalStreams');
      const active = await query('streamCore', 'ActiveStreams');
      stats = { totalStreams: String(total), activeStreams: String(active) };
    } catch (e) {
      console.warn(`[health] Stats fetch failed: ${e.message}`);
    }
  }

  let varaEth = null;
  try {
    const [escrowInfo, relayer] = await Promise.all([
      getEscrowInfo(),
      getRelayerBalance(),
    ]);
    if (escrowInfo) {
      varaEth = {
        status: 'configured',
        network: escrowInfo.network,
        chainId: escrowInfo.chainId,
        escrow:  escrowInfo.escrow,
        mirror:  escrowInfo.mirror,
        token:   escrowInfo.token,
        relayer: relayer ? {
          address:    relayer.address,
          balanceEth: (Number(BigInt(relayer.balanceWei)) / 1e18).toFixed(6) + ' ETH',
        } : null,
      };
    }
  } catch (e) {
    varaEth = { status: 'error', error: e.message };
  }

  res.json({
    status: api && api.isConnected ? 'healthy' : 'degraded',
    network: api ? api.runtimeChain.toString() : null,
    account: keyring ? keyring.address : null,
    balance,
    stats,
    contracts: getProgramIds(),
    varaEth,
    wvaraEnv: process.env.WVARA_TOKEN_ID ? `set (${process.env.WVARA_TOKEN_ID.slice(0, 10)}...)` : 'NOT SET',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

export default router;
