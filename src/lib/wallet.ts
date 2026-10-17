/**
 * src/lib/wallet.ts
 *
 * MetaMask connection via EIP-6963 (multi-wallet standard).
 * Falls back to window.ethereum and window.ethereum.providers[] if needed.
 *
 * EIP-6963 primer for beginners:
 *  Modern wallets announce themselves via a custom event on the window.
 *  We listen for "eip6963:announceProvider" and match the one with
 *  rdns === "io.metamask" so we never accidentally connect the wrong wallet.
 */

import { BrowserProvider, getAddress } from 'ethers';
import type { JsonRpcSigner } from 'ethers';
import { SUPPORTED_CHAINS } from './chains';

// ── Types ──────────────────────────────────────────────────────────────────

/** Shape that each EIP-6963 wallet announcement carries */
interface EIP6963ProviderInfo {
  rdns: string;   // Reverse-domain name, e.g. "io.metamask"
  uuid: string;
  name: string;
  icon: string;
}

interface EIP6963ProviderDetail {
  info: EIP6963ProviderInfo;
  provider: any; // The raw injected provider object
}

export interface WalletConnection {
  /** Raw injected provider (window.ethereum-like object) */
  injected: any;
  /** ethers v6 BrowserProvider wrapping the injected object */
  provider: BrowserProvider;
  signer: JsonRpcSigner;
  address: string;
  chainId: number;
}

// ── EIP-6963 discovery ─────────────────────────────────────────────────────

/**
 * Attempts to find MetaMask via EIP-6963 multi-wallet announcement protocol.
 * Returns the raw injected provider, or null if MetaMask is not found via EIP-6963.
 *
 * How it works:
 *  1. We fire "eip6963:requestProvider" — wallets that support EIP-6963 respond
 *     immediately with "eip6963:announceProvider" events carrying their info.
 *  2. We collect all announcements for 200 ms, then pick the one with
 *     rdns === "io.metamask".
 */
function discoverMetaMaskViaEIP6963(): Promise<any | null> {
  return new Promise((resolve) => {
    const found: EIP6963ProviderDetail[] = [];

    const handler = (event: Event) => {
      const detail = (event as CustomEvent).detail as EIP6963ProviderDetail;
      if (detail?.info?.rdns === 'io.metamask') {
        found.push(detail);
      }
    };

    // Listen for announcements
    window.addEventListener('eip6963:announceProvider', handler);

    // Ask all installed wallets to announce themselves
    window.dispatchEvent(new Event('eip6963:requestProvider'));

    // Wait a tick for synchronous announcements, then resolve
    setTimeout(() => {
      window.removeEventListener('eip6963:announceProvider', handler);
      resolve(found.length > 0 ? found[0].provider : null);
    }, 200);
  });
}

/**
 * Returns the MetaMask injected provider using:
 *  1. EIP-6963 (preferred — avoids conflicts with other wallets like Coinbase)
 *  2. window.ethereum.providers[] array (some setups inject multiple wallets here)
 *  3. window.ethereum directly (legacy single-wallet fallback)
 *
 * Throws a friendly error if MetaMask is not detected at all.
 */
async function getMetaMaskProvider(): Promise<any> {
  // 1. Try EIP-6963 first
  try {
    const eip6963Provider = await discoverMetaMaskViaEIP6963();
    if (eip6963Provider) return eip6963Provider;
  } catch {
    // EIP-6963 failed silently; fall through to legacy
  }

  // 2. Multiple wallets injected as an array
  const win = window as any;
  if (Array.isArray(win.ethereum?.providers)) {
    const mm = win.ethereum.providers.find(
      (p: any) => p.isMetaMask && !p.isBraveWallet && !p.isCoinbaseWallet
    );
    if (mm) return mm;
  }

  // 3. Single legacy window.ethereum
  if (win.ethereum?.isMetaMask) {
    return win.ethereum;
  }

  throw new Error('METAMASK_NOT_FOUND');
}

// ── Public API ─────────────────────────────────────────────────────────────

/**
 * Connects to MetaMask.
 * MUST be called from a user-gesture handler (click event).
 * Calls eth_requestAccounts which triggers the MetaMask popup.
 */
export async function connectMetaMask(): Promise<WalletConnection> {
  const injected = await getMetaMaskProvider();

  // eth_requestAccounts — triggers the MetaMask popup for the user to approve
  const accounts: string[] = await injected.request({ method: 'eth_requestAccounts' });

  if (!accounts || accounts.length === 0) {
    throw new Error('No accounts returned. Did you reject the MetaMask popup?');
  }

  const provider = new BrowserProvider(injected);
  const signer = await provider.getSigner();
  const address = getAddress(accounts[0]);
  const network = await provider.getNetwork();

  return { injected, provider, signer, address, chainId: Number(network.chainId) };
}

/**
 * Asks MetaMask to switch to a specific chain.
 * If the chain is not yet in MetaMask, it adds it (wallet_addEthereumChain).
 *
 * @param injected  The raw injected provider returned by connectMetaMask()
 * @param chainId   Numeric chain ID (e.g. 11155111 for Sepolia)
 */
export async function switchToChain(injected: any, chainId: number): Promise<void> {
  const config = SUPPORTED_CHAINS[chainId];
  if (!config) throw new Error(`Chain ${chainId} is not configured.`);

  try {
    await injected.request({
      method: 'wallet_switchEthereumChain',
      params: [{ chainId: config.hexId }],
    });
  } catch (err: any) {
    // Error 4902: chain not yet added to MetaMask — add it automatically
    if (err?.code === 4902 || err?.error?.code === 4902) {
      await injected.request({
        method: 'wallet_addEthereumChain',
        params: [
          {
            chainId: config.hexId,
            chainName: config.name,
            nativeCurrency: config.nativeCurrency,
            rpcUrls: [config.rpcUrl],
            blockExplorerUrls: [config.explorer],
          },
        ],
      });
    } else {
      throw err;
    }
  }
}

/**
 * Translates raw wallet errors into plain-English messages that a non-technical
 * user can understand.
 */
export function friendlyWalletError(err: any): string {
  const code = err?.code ?? err?.error?.code;
  const message = (err?.message ?? '').toLowerCase();

  // User clicked "Reject" in MetaMask
  if (code === 4001 || message.includes('action_rejected') || message.includes('user rejected')) {
    return 'You rejected the request in MetaMask. Click "Connect MetaMask" and then approve.';
  }

  // MetaMask is already showing a pending request popup
  if (code === -32002 || message.includes('already pending')) {
    return 'MetaMask already has a request open. Check the MetaMask icon in your browser toolbar.';
  }

  // MetaMask is not installed / not found
  if (message.includes('metamask_not_found') || message.includes('no web3') || message.includes('not found')) {
    return 'MetaMask not detected. Open this page in Chrome (or Firefox) with the MetaMask extension installed.';
  }

  return err?.message || 'Unknown wallet error. Check the console for details.';
}
