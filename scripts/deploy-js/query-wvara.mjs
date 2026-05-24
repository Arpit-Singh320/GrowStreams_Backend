import { GearApi } from '@gear-js/api';
import { Sails } from 'sails-js';
import { SailsIdlParser } from 'sails-js-parser';

const IDL = `
constructor { New : (); };
service Vft {
  query TotalSupply : () -> u128;
  query BalanceOf : (account: actor_id) -> u128;
};
`;

const WVARA = '0xf5e9cb1d1e46b0cda6578dd1684b30f281a45dfaa390e4945b7bfc8ab3e27f3d';
const VAULT = '0x20099b7637ae936670f54464c4109d1f028fbb63230e151ea4ef29c4a94cbcef';
const SENDER = '0xb868111c0bdb68f5e9147271d35136c08eb2b65327e61e8eb6ce1f7cc3239741'; // Sarthak
const RECEIVER = '0xaa59600bfd03789b28d64cd932146981e41c1b8ad0934beeb842c68c349cec7b'; // Testing

async function main() {
  console.log('Connecting to Vara mainnet...');
  const api = await GearApi.create({ providerAddress: 'wss://rpc.vara.network' });
  
  const parser = await SailsIdlParser.new();
  const sails = new Sails(parser);
  sails.parseIdl(IDL);
  sails.setApi(api);
  sails.setProgramId(WVARA);
  
  const origin = '0x0000000000000000000000000000000000000000000000000000000000000000';
  
  console.log('\n=== wVARA Contract State ===');
  
  function extractValue(v) {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'number') return String(v);
    if (v && typeof v.toBigInt === 'function') return v.toBigInt().toString();
    if (v && typeof v.toNumber === 'function') return String(v.toNumber());
    if (v && v.value !== undefined) return extractValue(v.value);
    return String(v);
  }
  
  // Use raw state read via api.programState.read
  const stateResult = await api.programState.read({
    programId: WVARA,
    payload: '0x', // empty payload for full state
  });
  console.log('State result type:', typeof stateResult);
  console.log('State result:', stateResult?.toHuman?.() || stateResult);
  
  // Also try direct message read for BalanceOf
  const balPayload = sails.services.Vft.queries.BalanceOf(origin, null, null, RECEIVER);
  console.log('Balance query payload:', balPayload._payload ? Buffer.from(balPayload._payload).toString('hex') : 'N/A');
  
  await api.disconnect();
}

main().catch(console.error);
