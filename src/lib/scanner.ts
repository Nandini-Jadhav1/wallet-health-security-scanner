/**
 * src/lib/scanner.ts
 *
 * Fetches all ACTIVE ERC-20 approvals for a wallet address.
 *
 * Token-scoped design: every getLogs call is filtered by address = token,
 * so Alchemy free-tier and public nodes both work without hitting global
 * range caps.
 *
 * Two providers:
 *   provider     — Alchemy (authenticated) — used for allowance(), getCode(), getBlock()
 *   logsProvider — public node             — used ONLY for getLogs()
 */

import {
  id,
  zeroPadValue,
  getAddress,
  Contract,
  JsonRpcProvider,
} from 'ethers';
import type { Provider, Log } from 'ethers';
import { getChainConfig, DEMO_TOKEN_DEPLOY_BLOCK } from './chains';
import { MAINNET_POPULAR_TOKENS, getKnownToken } from './knownTokens';
import { getContractAddresses } from '../contracts/addresses';

// ERC-20 ABI — minimal: allowance, symbol, decimals
const ERC20_ABI = [
  'function allowance(address owner, address spender) view returns (uint256)',
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

// keccak256("Approval(address,address,uint256)") — the canonical ERC-20 Approval topic
const APPROVAL_EVENT_TOPIC = id('Approval(address,address,uint256)');

// Approvals with allowance >= 2^255 are treated as "unlimited"
const UNLIMITED_THRESHOLD = 2n ** 255n;

// ── Public types ────────────────────────────────────────────────────────────

export interface ApprovalRecord {
  token: string;
  symbol: string;
  decimals: number;
  spender: string;
  allowance: bigint;
  allowanceFormatted: string;
  isUnlimited: boolean;
  lastUpdatedBlock: number;
  lastUpdatedTimestamp: number; // Unix seconds
  transactionHash: string;
}

export interface ScanOptions {
  fullHistory?: boolean;
  startBlock?: number;
  endBlock?: number;
  /** Optional list of token addresses to scan. When provided, skips auto-detection. */
  tokens?: string[];
}

export interface ScanProgress {
  currentChunk: number;
  totalChunks: number;
  percent: number;
  currentBlock: number;
  foundEvents: number;
  message: string;
}

export interface TokenScanError {
  token: string;
  symbol?: string;
  fromBlock: number;
  toBlock: number;
  message: string;
}

export interface ScannedTokenInfo {
  address: string;
  symbol: string;
  name?: string;
}

export interface ScanResult {
  approvals: ApprovalRecord[];
  scannedTokens: ScannedTokenInfo[];
  scannedRange: { fromBlock: number; toBlock: number; daysCovered: number };
  errors: TokenScanError[];
}

// ── Internal helpers ────────────────────────────────────────────────────────

/**
 * Runs async tasks with a concurrency cap.
 * WHY: Firing hundreds of RPC calls at once causes 429 errors. This pool
 * ensures at most `limit` inflight requests at any time.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next++;
      results[idx] = await fn(items[idx], idx);
      // Small pause between chunks to respect free RPC rate limits
      await new Promise((r) => setTimeout(r, 80));
    }
  });

  await Promise.all(workers);
  return results;
}

/**
 * getLogs for one token + block range with 429 rate-limit backoff and range halving.
 */
async function fetchLogsForToken(
  logsProvider: Provider,
  tokenAddress: string,
  paddedOwner: string,
  from: number,
  to: number,
  minChunk = 10,
  retriesLeft = 2
): Promise<Log[]> {
  try {
    return await logsProvider.getLogs({
      address: tokenAddress,
      topics: [APPROVAL_EVENT_TOPIC, paddedOwner],
      fromBlock: from,
      toBlock: to,
    });
  } catch (err: any) {
    const rawMsg = err?.error?.message ?? err?.info?.error?.message ?? err?.message ?? String(err);
    const msg = rawMsg.toLowerCase();
    const isRateLimit = msg.includes('429') || msg.includes('rate limit') || msg.includes('too many');

    // On 429: back off and retry. DO NOT halve into more parallel requests!
    if (isRateLimit && retriesLeft > 0) {
      await new Promise((r) => setTimeout(r, 1200 * (3 - retriesLeft)));
      return fetchLogsForToken(logsProvider, tokenAddress, paddedOwner, from, to, minChunk, retriesLeft - 1);
    }

    const span = to - from + 1;
    const isRangeError = msg.includes('range') || msg.includes('exceed') || msg.includes('result') || msg.includes('limit');

    if (isRangeError && span > minChunk) {
      // Halve and retry sequentially
      const mid = from + Math.floor((to - from) / 2);
      const left = await fetchLogsForToken(logsProvider, tokenAddress, paddedOwner, from, mid, minChunk, retriesLeft);
      const right = await fetchLogsForToken(logsProvider, tokenAddress, paddedOwner, mid + 1, to, minChunk, retriesLeft);
      return [...left, ...right];
    }

    throw err;
  }
}

// ── Main export ─────────────────────────────────────────────────────────────

/**
 * Fetches all active ERC-20 approvals for a wallet.
 *
 * @param provider      Alchemy provider (for allowance, getCode, getBlock)
 * @param logsProvider  Public-node provider (for getLogs only)
 * @param owner         Wallet address to scan
 * @param tokens        Token addresses to scan (if omitted, auto-detected by chain)
 * @param fromBlock     Start block override
 * @param chunkSize     Blocks per getLogs chunk (default 50000)
 * @param onProgress    Progress callback
 */
export async function fetchApprovals(
  provider: Provider,
  ownerAddress: string,
  onProgress?: (p: ScanProgress) => void,
  options: ScanOptions = {}
): Promise<ScanResult> {
  const owner = getAddress(ownerAddress);

  // Alchemy provider is used for chain metadata and live reads
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const chainConfig = getChainConfig(chainId);
  const currentBlock = await provider.getBlockNumber();

  // Build the logsProvider from the publicnode URL for this chain
  const logsProvider: Provider = new JsonRpcProvider(chainConfig.logsRpcUrl);

  // ── WHY Step 1: Determine which tokens to scan ──────────────────────────
  // Token-scoped: every getLogs is filtered by address = token, so no global
  // block-range cap applies on free Alchemy tier or public nodes.
  let targetTokens: ScannedTokenInfo[] = [];

  if (options.tokens && options.tokens.length > 0) {
    targetTokens = options.tokens.map((addr) => {
      const a = getAddress(addr);
      const known = getKnownToken(a);
      return { address: a, symbol: known?.symbol ?? 'CUSTOM', name: known?.name };
    });
  } else if (chainId === 11155111) {
    // Sepolia: scan only DemoToken
    const deployed = getContractAddresses(11155111);
    const zero = '0x0000000000000000000000000000000000000000';
    if (deployed.demoToken && deployed.demoToken !== zero) {
      targetTokens = [{ address: getAddress(deployed.demoToken), symbol: 'DEMO', name: 'Demo Token' }];
    }
  } else if (chainId === 1) {
    targetTokens = MAINNET_POPULAR_TOKENS.map((t) => ({
      address: getAddress(t.address),
      symbol: t.symbol,
      name: t.name,
    }));
  }

  // Block range
  const chunkSize = 25_000;
  let fromBlock: number;
  let daysCovered: number;

  if (options.startBlock !== undefined) {
    fromBlock = options.startBlock;
    daysCovered = 0;
  } else if (chainId === 11155111) {
    // WHY: Scan from DemoToken deploy block so we never ask for blocks before it existed
    fromBlock = DEMO_TOKEN_DEPLOY_BLOCK;
    daysCovered = 0;
  } else if (options.fullHistory) {
    fromBlock = 0;
    daysCovered = 0;
  } else {
    // Default: last ~50 000 blocks (~7 days on mainnet, safe default)
    const BLOCKS_IN_180_DAYS = Math.floor((180 * 24 * 3600) / chainConfig.blockTimeSec);
    fromBlock = Math.max(0, currentBlock - BLOCKS_IN_180_DAYS);
    daysCovered = 180;
  }

  const toBlock = options.endBlock ?? currentBlock;

  // ── Step 2: Build chunks ────────────────────────────────────────────────
  // WHY: Even public nodes have per-call limits. We pre-slice the range into
  // chunkSize-block segments and process them with a gentle concurrency pool of 2.
  const chunks: { from: number; to: number; token: ScannedTokenInfo }[] = [];
  for (const token of targetTokens) {
    for (let b = fromBlock; b <= toBlock; b += chunkSize) {
      chunks.push({ from: b, to: Math.min(b + chunkSize - 1, toBlock), token });
    }
  }

  if (chunks.length === 0) {
    return {
      approvals: [],
      scannedTokens: targetTokens,
      scannedRange: { fromBlock, toBlock, daysCovered },
      errors: [],
    };
  }

  // ── Step 3: getLogs through logsProvider ───────────────────────────────
  // WHY: We use the public node here, not Alchemy, so the 10-block free-tier
  // cap never applies. On a range error we halve recursively down to 10 blocks.
  const rawLogs: Log[] = [];
  const scanErrors: TokenScanError[] = [];
  const paddedOwner = zeroPadValue(owner, 32);
  let done = 0;

  await runWithConcurrency(chunks, 2, async (chunk) => {
    try {
      const logs = await fetchLogsForToken(
        logsProvider,
        chunk.token.address,
        paddedOwner,
        chunk.from,
        chunk.to
      );
      rawLogs.push(...logs);
    } catch (err: any) {
      // Exact message preserved — never silently swallowed
      const msg = err?.error?.message ?? err?.info?.error?.message ?? err?.message ?? String(err);
      scanErrors.push({
        token: chunk.token.address,
        symbol: chunk.token.symbol,
        fromBlock: chunk.from,
        toBlock: chunk.to,
        message: msg,
      });
    } finally {
      done++;
      onProgress?.({
        currentChunk: done,
        totalChunks: chunks.length,
        percent: Math.min(80, Math.round((done / chunks.length) * 80)),
        currentBlock: chunk.to,
        foundEvents: rawLogs.length,
        message: `Scanning ${chunk.token.symbol} blocks ${chunk.from.toLocaleString()}–${chunk.to.toLocaleString()}…`,
      });
    }
  });

  // ── Step 4: Filter ERC-20 logs (topics.length === 3) ──────────────────
  // WHY: ERC-721 Approval has 4 topics (tokenId is indexed). ERC-20 has exactly 3.
  const erc20Logs = rawLogs.filter((log) => log.topics.length === 3);

  onProgress?.({
    currentChunk: chunks.length, totalChunks: chunks.length,
    percent: 85, currentBlock: toBlock, foundEvents: erc20Logs.length,
    message: `Found ${erc20Logs.length} ERC-20 approval events. Deduplicating…`,
  });

  // ── Step 5: Keep latest event per token+spender ───────────────────────
  // WHY: Users may have approved, adjusted, and re-approved. Only the latest
  // event tells us the most recent on-chain state for that pair.
  const latestMap = new Map<string, { log: Log; spender: string; token: string }>();

  for (const log of erc20Logs) {
    const token = getAddress(log.address);
    const spender = getAddress('0x' + log.topics[2].slice(26));
    const key = `${token.toLowerCase()}-${spender.toLowerCase()}`;
    const existing = latestMap.get(key);

    if (
      !existing ||
      log.blockNumber > existing.log.blockNumber ||
      (log.blockNumber === existing.log.blockNumber && log.index > existing.log.index)
    ) {
      latestMap.set(key, { log, spender, token });
    }
  }

  const unique = Array.from(latestMap.values());

  onProgress?.({
    currentChunk: chunks.length, totalChunks: chunks.length,
    percent: 90, currentBlock: toBlock, foundEvents: unique.length,
    message: `Verifying live allowances for ${unique.length} pairs…`,
  });

  // ── Step 6: allowance() → drop zeros, read symbol/decimals, flag unlimited ──
  // WHY allowance(): The log shows an approval EVENT, not current state. The
  // allowance may already be spent or revoked. Only query and keep non-zero.
  // WHY try/catch on symbol/decimals: Non-standard tokens (MKR, etc.) can revert.
  const activeApprovals: ApprovalRecord[] = [];

  await runWithConcurrency(unique, 5, async ({ log, spender, token }) => {
    try {
      const contract = new Contract(token, ERC20_ABI, provider);

      // Live allowance check via Alchemy (accurate, no cap issues)
      const liveAllowance: bigint = await contract.allowance(owner, spender);
      if (liveAllowance === 0n) return; // Already revoked or fully spent

      // Safe symbol read
      let symbol = 'UNKNOWN';
      try { symbol = await contract.symbol(); }
      catch { symbol = getKnownToken(token)?.symbol ?? `${token.slice(0, 6)}…${token.slice(-4)}`; }

      // Safe decimals read
      let decimals = 18;
      try { decimals = Number(await contract.decimals()); }
      catch { decimals = getKnownToken(token)?.decimals ?? 18; }

      // Flag unlimited (≥ 2^255)
      const isUnlimited = liveAllowance >= UNLIMITED_THRESHOLD;
      let allowanceFormatted = 'Unlimited';
      if (!isUnlimited) {
        const d = 10n ** BigInt(decimals);
        const intPart = liveAllowance / d;
        const fracPart = liveAllowance % d;
        allowanceFormatted = fracPart === 0n
          ? intPart.toString()
          : `${intPart}.${fracPart.toString().padStart(decimals, '0').slice(0, 4)}`;
      }

      // Block timestamp for age-based risk scoring
      let lastUpdatedTimestamp = Math.floor(Date.now() / 1000);
      try {
        const block = await provider.getBlock(log.blockNumber);
        if (block?.timestamp) lastUpdatedTimestamp = block.timestamp;
      } catch {
        const blocksAgo = currentBlock - log.blockNumber;
        lastUpdatedTimestamp = Math.floor(Date.now() / 1000) - blocksAgo * chainConfig.blockTimeSec;
      }

      activeApprovals.push({
        token, symbol, decimals, spender,
        allowance: liveAllowance, allowanceFormatted, isUnlimited,
        lastUpdatedBlock: log.blockNumber, lastUpdatedTimestamp,
        transactionHash: log.transactionHash,
      });
    } catch (err) {
      console.warn(`allowance check failed for ${token} → ${spender}:`, err);
    }
  });

  onProgress?.({
    currentChunk: chunks.length, totalChunks: chunks.length,
    percent: 100, currentBlock: toBlock, foundEvents: activeApprovals.length,
    message: `Done. ${activeApprovals.length} active approvals found.`,
  });

  return {
    approvals: activeApprovals,
    scannedTokens: targetTokens,
    scannedRange: { fromBlock, toBlock, daysCovered },
    errors: scanErrors,
  };
}
