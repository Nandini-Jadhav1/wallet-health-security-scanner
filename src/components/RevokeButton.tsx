import React, { useState } from 'react';
import { revokeApproval, ensureWalletNetwork } from '../lib/revoke';
import type { RevokeProgressState } from '../lib/revoke';
import { getChainConfig } from '../lib/chains';
import { useToast } from './Toasts';
import { Contract } from 'ethers';
import type { JsonRpcSigner } from 'ethers';
import { ExternalLink, Loader2, ShieldAlert, Check } from 'lucide-react';

interface RevokeButtonProps {
  tokenAddress: string;
  spenderAddress: string;
  symbol: string;
  scannedAddress: string;
  connectedAddress: string | null;
  targetChainId: number;
  signer: JsonRpcSigner | null;
  onRevokedSuccess: (token: string, spender: string) => void;
  isQueueActive?: boolean;
}

export const RevokeButton: React.FC<RevokeButtonProps> = ({
  tokenAddress,
  spenderAddress,
  symbol,
  scannedAddress,
  connectedAddress,
  targetChainId,
  signer,
  onRevokedSuccess,
  isQueueActive = false,
}) => {
  const [state, setState] = useState<RevokeProgressState>({ status: 'idle' });
  const { addToast } = useToast();
  const chainConfig = getChainConfig(targetChainId);

  // Requirement: Enable Revoke ONLY if connected address === scanned address (case-insensitive)
  const isOwner =
    Boolean(connectedAddress) &&
    connectedAddress?.toLowerCase() === scannedAddress.toLowerCase();

  const handleRevoke = async () => {
    if (!isOwner || !signer) {
      addToast({
        type: 'info',
        title: 'View Only Mode',
        message: 'Connect the scanned wallet address to revoke approvals.',
      });
      return;
    }

    try {
      setState({ status: 'pending' });

      // Ensure network is aligned
      await ensureWalletNetwork(targetChainId);

      addToast({
        type: 'pending',
        title: 'Revoke Broadcasted',
        message: `Please confirm transaction in your wallet to zero out allowance for ${symbol}...`,
      });

      const network = await signer.provider.getNetwork();
      const walletChainId = Number(network.chainId);

      const { hash } = await revokeApproval(
        signer,
        scannedAddress,
        tokenAddress,
        spenderAddress,
        walletChainId,
        targetChainId,
        (s) => {
          setState(s);
          if (s.status === 'pending' && s.txHash) {
            addToast({
              type: 'pending',
              title: 'Transaction Submitted',
              message: `Zeroing approval on ${chainConfig.shortName}...`,
              link: {
                url: `${chainConfig.explorerUrl}/tx/${s.txHash}`,
                text: 'View on Explorer',
              },
            });
          }
        }
      );

      // Verify on-chain allowance was actually zeroed
      // WHY: To eliminate UI race conditions, re-query allowance before removing the row.
      const provider = signer.provider;
      const tokenContract = new Contract(
        tokenAddress,
        ['function allowance(address,address) view returns (uint256)'],
        provider
      );
      const remainingAllowance = await tokenContract.allowance(scannedAddress, spenderAddress);

      if (remainingAllowance === 0n) {
        setState({ status: 'confirmed', txHash: hash });
        addToast({
          type: 'success',
          title: 'Approval Revoked!',
          message: `Successfully set allowance for ${symbol} to 0.`,
          link: {
            url: `${chainConfig.explorerUrl}/tx/${hash}`,
            text: 'Explorer Confirmation',
          },
        });
        onRevokedSuccess(tokenAddress, spenderAddress);
      } else {
        throw new Error('On-chain allowance still remains non-zero.');
      }
    } catch (err: any) {
      console.error('Revoke failed:', err);
      const msg = err?.message || 'Transaction rejected or failed';
      setState({ status: 'failed', errorMessage: msg });
      addToast({
        type: 'error',
        title: 'Revoke Failed',
        message: msg.length > 90 ? `${msg.slice(0, 90)}...` : msg,
      });
    }
  };

  if (!isOwner) {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 select-none cursor-default">
        View only
      </span>
    );
  }

  if (state.status === 'pending') {
    return (
      <div className="inline-flex items-center gap-1.5">
        <button
          disabled
          className="px-3 py-1.5 bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-wait"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Revoking...</span>
        </button>
        {state.txHash && (
          <a
            href={`${chainConfig.explorerUrl}/tx/${state.txHash}`}
            target="_blank"
            rel="noreferrer"
            className="text-slate-400 hover:text-indigo-600 transition"
            title="View pending tx on explorer"
          >
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
        )}
      </div>
    );
  }

  if (state.status === 'confirmed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800">
        <Check className="w-3.5 h-3.5" />
        Revoked
      </span>
    );
  }

  return (
    <button
      onClick={handleRevoke}
      disabled={isQueueActive}
      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/30 dark:hover:bg-rose-900/40 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50 rounded-xl text-xs font-semibold transition flex items-center gap-1 shadow-sm active:scale-95 disabled:opacity-50"
    >
      <ShieldAlert className="w-3.5 h-3.5" />
      <span>Revoke</span>
    </button>
  );
};
