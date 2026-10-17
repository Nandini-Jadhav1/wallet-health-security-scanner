/**
 * src/lib/chains.ts
 *
 * Chain configuration for Ethereum Mainnet and Sepolia Testnet.
 *
 * Two RPC URLs per chain:
 *  - rpcUrl     : Alchemy (used for allowance checks, getCode, getBlock — authenticated)
 *  - logsRpcUrl : Public node (used ONLY for getLogs — no key required, avoids Alchemy free-tier 10-block cap)
 */

// Read Alchemy key from Vite env vars (browser) or process.env (Node/Hardhat tests)
const ALCHEMY_KEY =
  (typeof import.meta !== 'undefined' && import.meta?.env?.VITE_ALCHEMY_KEY) ||
  (typeof process !== 'undefined' && process?.env?.VITE_ALCHEMY_KEY) ||
  '';

export interface ChainConfig {
  id: number;
  name: string;
  shortName: string;
  hexId: string;           // Hex chainId for wallet_switchEthereumChain ("0xaa36a7")
  isTestnet: boolean;
  rpcUrl: string;          // Alchemy — authenticated, for all reads EXCEPT getLogs
  logsRpcUrl: string;      // Public node — used ONLY for getLogs (no free-tier cap)
  /** @deprecated use logsRpcUrl or rpcUrl directly */
  publicFallbackRpcUrl: string;
  explorer: string;        // Block explorer base URL
  explorerUrl: string;     // Alias kept for backward compat with old revoke.ts code
  blockTimeSec: number;    // Average seconds per block (~12 for Ethereum/Sepolia)
  /** @deprecated renamed to blockTimeSec — kept so old scanner.ts still compiles */
  avgBlockTime: number;
  nativeCurrency: { name: string; symbol: string; decimals: number };
}

export const SUPPORTED_CHAINS: Record<number, ChainConfig> = {
  // ── Ethereum Mainnet ─────────────────────────────────────────────────────
  1: {
    id: 1,
    name: 'Ethereum Mainnet',
    shortName: 'Ethereum',
    hexId: '0x1',
    isTestnet: false,
    rpcUrl: ALCHEMY_KEY
      ? `https://eth-mainnet.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : 'https://eth.drpc.org',
    // Public node — free, no key, no 10-block getLogs cap
    logsRpcUrl: 'https://ethereum-rpc.publicnode.com',
    publicFallbackRpcUrl: 'https://ethereum-rpc.publicnode.com',
    explorer: 'https://etherscan.io',
    explorerUrl: 'https://etherscan.io',
    blockTimeSec: 12,
    avgBlockTime: 12,
    nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  },

  // ── Sepolia Testnet ──────────────────────────────────────────────────────
  11155111: {
    id: 11155111,
    name: 'Sepolia Testnet',
    shortName: 'Sepolia',
    hexId: '0xaa36a7',
    isTestnet: true,
    rpcUrl: ALCHEMY_KEY
      ? `https://eth-sepolia.g.alchemy.com/v2/${ALCHEMY_KEY}`
      : 'https://ethereum-sepolia-rpc.publicnode.com',
    // Public node — free, no key, supports browser CORS and wide getLogs ranges
    logsRpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    publicFallbackRpcUrl: 'https://ethereum-sepolia-rpc.publicnode.com',
    explorer: 'https://sepolia.etherscan.io',
    explorerUrl: 'https://sepolia.etherscan.io',
    blockTimeSec: 12,
    avgBlockTime: 12,
    nativeCurrency: { name: 'Sepolia Ether', symbol: 'SEP', decimals: 18 },
  },
};

export const DEFAULT_CHAIN_ID = 11155111; // Sepolia — safe for Demo Lab

/**
 * The Sepolia block at which DemoToken was deployed.
 * Update this to the real deployment block after running `scripts/deploy.cjs`.
 * Setting it accurately avoids scanning blocks before the contract existed.
 */
export const DEMO_TOKEN_DEPLOY_BLOCK = 11_900_000;

export function getChainConfig(chainId: number): ChainConfig {
  return SUPPORTED_CHAINS[chainId] || SUPPORTED_CHAINS[DEFAULT_CHAIN_ID];
}
