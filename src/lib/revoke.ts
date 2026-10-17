/**
 * src/lib/revoke.ts
 *
 * Revokes an ERC-20 token approval by setting allowance to 0.
 *
 * Safety rules enforced:
 *  1. Only the wallet that OWNS the tokens can revoke (address match check).
 *  2. The wallet must be on the same chain the scan ran on (chain ID match).
 *  3. Only calls approve(spender, 0) — the ABI contains nothing else dangerous.
 *  4. After the tx confirms, re-checks allowance to prove it really went to 0.
 */

import { Contract, getAddress } from 'ethers';
import type { JsonRpcSigner, ContractTransactionReceipt } from 'ethers';

// Minimal ABI: only approve + allowance. No transfer, no permit, nothing else.
// WHY: Restricting the ABI prevents accidentally calling any dangerous function.
const REVOKE_ABI = [
  'function approve(address spender, uint256 value) returns (bool)',
  'function allowance(address owner, address spender) view returns (uint256)',
];

export type RevokeStatus = 'idle' | 'pending' | 'confirmed' | 'failed';

export interface RevokeProgressState {
  status: RevokeStatus;
  txHash?: string;
  errorMessage?: string;
}

/**
 * Callback shape for revoke state updates.
 * The UI component can subscribe to these to show pending / confirmed / failed states.
 */
export type OnRevokeState = (state: RevokeProgressState) => void;

/**
 * Revokes one ERC-20 approval by calling approve(spender, 0).
 *
 * @param signer          Connected MetaMask signer
 * @param scannedOwner    The wallet address that was scanned (the token owner)
 * @param token           ERC-20 token contract address
 * @param spender         Spender whose allowance we are zeroing
 * @param walletChainId   Chain ID the connected wallet is currently on
 * @param scanChainId     Chain ID the scan was performed on
 * @param onState         Optional callback for UI state updates
 */
export async function revokeApproval(
  signer: JsonRpcSigner,
  scannedOwner: string,
  token: string,
  spender: string,
  walletChainId: number,
  scanChainId: number,
  onState?: OnRevokeState
): Promise<{ hash: string; receipt: ContractTransactionReceipt }> {
  // ── Guard 1: Only the token owner can revoke ────────────────────────────
  // WHY: approve(spender, 0) must be called FROM the owner address.
  // If a different wallet is connected, the tx would either fail or revoke
  // a different person's approval — both are wrong.
  const signerAddress = await signer.getAddress();
  if (signerAddress.toLowerCase() !== scannedOwner.toLowerCase()) {
    throw new Error(
      'View only — connect the wallet that owns these tokens to revoke. ' +
      `Scanned: ${scannedOwner.slice(0, 8)}…, Connected: ${signerAddress.slice(0, 8)}…`
    );
  }

  // ── Guard 2: Chain must match ───────────────────────────────────────────
  // WHY: The same token address on a different chain is a completely different
  // contract. Revoking on the wrong chain wastes gas and does nothing useful.
  if (walletChainId !== scanChainId) {
    throw new Error(
      `Wrong network. The scan ran on chain ${scanChainId} but your wallet is on chain ${walletChainId}. ` +
      `Switch your wallet to the correct network first.`
    );
  }

  const tokenAddr = getAddress(token);
  const spenderAddr = getAddress(spender);
  const contract = new Contract(tokenAddr, REVOKE_ABI, signer);

  // ── Step 1: Broadcast approve(spender, 0) ───────────────────────────────
  onState?.({ status: 'pending' });

  const tx = await contract.approve(spenderAddr, 0n);
  const hash = tx.hash;

  onState?.({ status: 'pending', txHash: hash });

  // ── Step 2: Wait for 1 block confirmation ───────────────────────────────
  const receipt = await tx.wait(1);
  if (!receipt || receipt.status === 0) {
    onState?.({ status: 'failed', txHash: hash, errorMessage: 'Transaction reverted on-chain.' });
    throw new Error('Revoke transaction reverted on-chain.');
  }

  // ── Step 3: Re-check allowance to prove it is 0 ────────────────────────
  // WHY: The receipt confirms the tx was included, but we double-check by
  // reading the storage slot. This eliminates any UI race condition.
  const remaining: bigint = await contract.allowance(scannedOwner, spenderAddr);
  if (remaining !== 0n) {
    onState?.({ status: 'failed', txHash: hash, errorMessage: 'Allowance still non-zero after revoke.' });
    throw new Error('On-chain allowance is still non-zero after the revoke transaction.');
  }

  onState?.({ status: 'confirmed', txHash: hash });

  return { hash, receipt };
}


// ── Backward-compatible re-exports ──────────────────────────────────────────
// WHY: DemoLab, RevokeButton, and SaveReport import ensureWalletNetwork and
// connectBrowserWallet from this file. We re-export from wallet.ts so those
// components keep compiling without changing their import lines.

import { switchToChain, connectMetaMask } from './wallet';

/**
 * Ensures the connected wallet is on the target chain. If not, prompts a switch.
 * This is a convenience wrapper around switchToChain for components that don't
 * use the useWallet hook directly.
 */
export async function ensureWalletNetwork(targetChainId: number): Promise<void> {
  if (typeof window === 'undefined' || !(window as any).ethereum) {
    throw new Error('No Web3 wallet found. Please install MetaMask.');
  }

  const ethereum = (window as any).ethereum;
  const currentChainHex: string = await ethereum.request({ method: 'eth_chainId' });
  const currentChainId = parseInt(currentChainHex, 16);

  if (currentChainId !== targetChainId) {
    await switchToChain(ethereum, targetChainId);
  }
}

/**
 * @deprecated Use useWallet hook instead. Kept only for DemoLab backward compat.
 */
export async function connectBrowserWallet() {
  return connectMetaMask();
}
