import 'dotenv/config';
import { JsonRpcProvider, FetchRequest } from 'ethers';
import { fetchApprovals } from '../src/lib/scanner';
import { MAINNET_POPULAR_TOKENS } from '../src/lib/knownTokens';
import { getContractAddresses } from '../src/contracts/addresses';
import { DEMO_TOKEN_DEPLOY_BLOCK } from '../src/lib/chains';

const alchemyKey = process.env.VITE_ALCHEMY_KEY || '';

console.log('================================================================');
console.log('       WALLET HEALTH CHECK - STOP POINT 1: SCANNER TEST         ');
console.log('================================================================');

if (alchemyKey) {
  console.log('✓ Found VITE_ALCHEMY_KEY via dotenv configuration.');
  console.log(`  Key snippet: ${alchemyKey.slice(0, 8)}...${alchemyKey.slice(-4)}\n`);
} else {
  console.log('❌ No VITE_ALCHEMY_KEY found in .env via dotenv.');
  console.log('  Please ensure .env contains VITE_ALCHEMY_KEY=your_key.\n');
}

// Target wallet: vitalik.eth on Ethereum Mainnet
const TARGET_MAINNET_WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045';

async function testMainnet() {
  console.log('----------------------------------------------------------------');
  console.log(' TEST 1: Ethereum Mainnet Token-Scoped Scan');
  console.log('----------------------------------------------------------------');

  const rpcUrl = alchemyKey
    ? `https://eth-mainnet.g.alchemy.com/v2/${alchemyKey}`
    : 'https://ethereum-rpc.publicnode.com';

  const req = new FetchRequest(rpcUrl);
  req.timeout = 15000;
  const provider = new JsonRpcProvider(req);

  try {
    const net = await provider.getNetwork();
    const currentBlock = await provider.getBlockNumber();
    console.log(`Connected RPC: ${rpcUrl.replace(alchemyKey, '[REDACTED]')}`);
    console.log(`Network: Chain ID ${net.chainId} (${net.name})`);
    console.log(`Current Block: ${currentBlock.toLocaleString()}`);
    console.log(`Target Wallet: ${TARGET_MAINNET_WALLET} (vitalik.eth)`);
    console.log(`Tokens to Scan: ${MAINNET_POPULAR_TOKENS.map((t) => `${t.symbol} (${t.address})`).join(', ')}`);
    console.log(`\nStarting fetchApprovals with token-address scoping...\n`);

    const result = await fetchApprovals(
      provider,
      TARGET_MAINNET_WALLET,
      (progress) => {
        console.log(`  [${progress.percent}%] ${progress.message}`);
      }
    );

    console.log('\n================ MAINNET SCAN RESULTS ================');
    console.log(`Scanned Tokens: ${result.scannedTokens.map((t) => t.symbol).join(', ')}`);
    console.log(`Block Range: ${result.scannedRange.fromBlock.toLocaleString()} - ${result.scannedRange.toBlock.toLocaleString()} (~${result.scannedRange.daysCovered} days)`);
    console.log(`Errors Encountered: ${result.errors.length}`);
    if (result.errors.length > 0) {
      console.log('\n❌ Chunk / RPC Errors (Honest Output):');
      result.errors.forEach((err, idx) => {
        console.log(`  [Error #${idx + 1}] Token: ${err.symbol || err.token}`);
        console.log(`    Range: Blocks ${err.fromBlock.toLocaleString()} - ${err.toBlock.toLocaleString()}`);
        console.log(`    Message: ${err.message}`);
      });
    }

    console.log(`\nActive Approvals Found: ${result.approvals.length}`);
    if (result.approvals.length > 0) {
      result.approvals.forEach((app, idx) => {
        console.log(`  [#${idx + 1}] Token: ${app.symbol} (${app.token})`);
        console.log(`      Spender: ${app.spender}`);
        console.log(`      Allowance: ${app.allowanceFormatted} (Unlimited: ${app.isUnlimited})`);
        console.log(`      Updated Block: ${app.lastUpdatedBlock}`);
        console.log(`      Tx Hash: ${app.transactionHash}`);
      });
    }
  } catch (error: any) {
    console.error('\n❌ Fatal Mainnet Scan Failure:');
    console.error(`Message: ${error?.message || error}`);
    if (error?.error) console.error('Underlying error:', error.error);
  }
}

async function testSepolia() {
  console.log('\n----------------------------------------------------------------');
  console.log(' TEST 2: Sepolia Testnet DemoToken Scan');
  console.log('----------------------------------------------------------------');

  const sepoliaRpcUrl = alchemyKey
    ? `https://eth-sepolia.g.alchemy.com/v2/${alchemyKey}`
    : 'https://ethereum-sepolia-rpc.publicnode.com';

  const req = new FetchRequest(sepoliaRpcUrl);
  req.timeout = 15000;
  const provider = new JsonRpcProvider(req);

  try {
    const net = await provider.getNetwork();
    const currentBlock = await provider.getBlockNumber();
    const deployed = getContractAddresses(11155111);

    console.log(`Connected RPC: ${sepoliaRpcUrl.replace(alchemyKey, '[REDACTED]')}`);
    console.log(`Network: Chain ID ${net.chainId} (${net.name})`);
    console.log(`Current Block: ${currentBlock.toLocaleString()}`);
    console.log(`DemoToken Address in addresses.ts: ${deployed.demoToken}`);
    console.log(`DEMO_TOKEN_DEPLOY_BLOCK: ${DEMO_TOKEN_DEPLOY_BLOCK.toLocaleString()}`);

    const result = await fetchApprovals(
      provider,
      TARGET_MAINNET_WALLET,
      (progress) => {
        console.log(`  [${progress.percent}%] ${progress.message}`);
      }
    );

    console.log('\n================ SEPOLIA SCAN RESULTS ================');
    console.log(`Scanned Tokens: ${result.scannedTokens.map((t) => t.symbol).join(', ') || 'None configured'}`);
    console.log(`Block Range: ${result.scannedRange.fromBlock.toLocaleString()} - ${result.scannedRange.toBlock.toLocaleString()}`);
    console.log(`Errors / Status Messages: ${result.errors.length}`);
    if (result.errors.length > 0) {
      result.errors.forEach((err, idx) => {
        console.log(`  [Message #${idx + 1}] ${err.message}`);
      });
    }
    console.log(`Active Approvals Found: ${result.approvals.length}`);
  } catch (error: any) {
    console.error('\n❌ Fatal Sepolia Scan Failure:');
    console.error(`Message: ${error?.message || error}`);
  }
}

async function run() {
  await testMainnet();
  await testSepolia();
  console.log('\n================================================================');
  console.log('                    SCANNER TEST COMPLETED                      ');
  console.log('================================================================');
}

run();
