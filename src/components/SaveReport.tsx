import React, { useState, useEffect } from 'react';
import { getContractAddresses } from '../contracts/addresses';
import { HEALTH_BADGE_ABI } from '../contracts/abis';
import { ensureWalletNetwork } from '../lib/revoke';
import { getChainConfig } from '../lib/chains';
import { useToast } from './Toasts';
import { Contract, isAddress } from 'ethers';
import type { JsonRpcSigner } from 'ethers';
import { Award, ExternalLink, Loader2, History } from 'lucide-react';

interface SaveReportProps {
  signer: JsonRpcSigner | null;
  connectedAddress: string | null;
  scannedAddress: string;
  targetChainId: number;
  activeApprovalsCount: number;
  highRiskCount: number;
}

interface SavedRecord {
  activeApprovals: number;
  highRisk: number;
  timestamp: number;
  exists: boolean;
}

export const SaveReport: React.FC<SaveReportProps> = ({
  signer,
  connectedAddress,
  scannedAddress,
  targetChainId,
  activeApprovalsCount,
  highRiskCount,
}) => {
  const [badgeAddress, setBadgeAddress] = useState(
    getContractAddresses(targetChainId).healthBadge
  );
  const [savedRecord, setSavedRecord] = useState<SavedRecord | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastTxHash, setLastTxHash] = useState<string | null>(null);

  const { addToast } = useToast();
  const chainConfig = getChainConfig(targetChainId);

  const isOwner =
    Boolean(connectedAddress) &&
    connectedAddress?.toLowerCase() === scannedAddress.toLowerCase();

  const isConfigured =
    isAddress(badgeAddress) &&
    badgeAddress !== '0x0000000000000000000000000000000000000000';

  // Load existing check record from chain
  const loadExistingRecord = async () => {
    if (!signer || !scannedAddress || !isConfigured) return;

    try {
      const contract = new Contract(badgeAddress, HEALTH_BADGE_ABI, signer);
      const res = await contract.getLatestCheck(scannedAddress);
      if (res && res[3]) {
        setSavedRecord({
          activeApprovals: Number(res[0]),
          highRisk: Number(res[1]),
          timestamp: Number(res[2]),
          exists: Boolean(res[3]),
        });
      }
    } catch (err) {
      console.warn('Could not query HealthBadge record:', err);
    }
  };

  useEffect(() => {
    setBadgeAddress(getContractAddresses(targetChainId).healthBadge);
    loadExistingRecord();
  }, [signer, scannedAddress, targetChainId]);

  const handleSaveOnChain = async () => {
    if (!isOwner || !signer) {
      addToast({
        type: 'info',
        title: 'View Only',
        message: 'Connect the scanned wallet address to save your report on-chain.',
      });
      return;
    }

    if (!isConfigured) {
      addToast({
        type: 'info',
        title: 'Contract Not Deployed',
        message: 'Deploy HealthBadge.sol and configure its address in src/contracts/addresses.ts to save reports.',
      });
      return;
    }

    try {
      setIsSaving(true);
      await ensureWalletNetwork(targetChainId);

      const contract = new Contract(badgeAddress, HEALTH_BADGE_ABI, signer);
      const tx = await contract.recordCheck(activeApprovalsCount, highRiskCount);

      setLastTxHash(tx.hash);
      addToast({
        type: 'pending',
        title: 'Saving Report On-Chain',
        message: 'Broadcasting HealthBadge.recordCheck transaction...',
        link: { url: `${chainConfig.explorerUrl}/tx/${tx.hash}`, text: 'View on Explorer' },
      });

      await tx.wait(1);

      addToast({
        type: 'success',
        title: 'Security Report Saved!',
        message: 'Your health audit checkpoint was permanently recorded on-chain.',
        link: { url: `${chainConfig.explorerUrl}/tx/${tx.hash}`, text: 'View Tx' },
      });

      await loadExistingRecord();
    } catch (err: any) {
      console.error('Failed to save health report:', err);
      addToast({
        type: 'error',
        title: 'Save Failed',
        message: err?.message || 'Transaction rejected or reverted',
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOwner) return null;

  return (
    <div className="bg-gradient-to-r from-indigo-50/50 to-purple-50/50 dark:from-indigo-950/20 dark:to-purple-950/20 border border-indigo-200/60 dark:border-indigo-800/40 rounded-3xl p-6 shadow-sm flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 transition">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <Award className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
            On-Chain Health Checkpoint
          </h4>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md">
          Permanently record this audit on-chain via <code className="font-mono text-indigo-500">HealthBadge.sol</code> to
          prove your wallet health to protocols, DAOs, or partners.
        </p>

        {savedRecord && savedRecord.exists && (
          <div className="flex items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400 pt-1">
            <History className="w-3.5 h-3.5 text-indigo-500" />
            <span>
              Last checkpoint:{' '}
              <strong className="text-slate-700 dark:text-slate-300">
                {new Date(savedRecord.timestamp * 1000).toLocaleDateString()}
              </strong>{' '}
              ({savedRecord.activeApprovals} active, {savedRecord.highRisk} high risk)
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
        <button
          onClick={handleSaveOnChain}
          disabled={isSaving}
          className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md shadow-indigo-600/20 transition flex items-center gap-2"
        >
          {isSaving ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span>Saving on-chain...</span>
            </>
          ) : (
            <>
              <Award className="w-4 h-4" />
              <span>Save Report On-Chain</span>
            </>
          )}
        </button>

        {lastTxHash && (
          <a
            href={`${chainConfig.explorerUrl}/tx/${lastTxHash}`}
            target="_blank"
            rel="noreferrer"
            className="p-2 text-slate-400 hover:text-indigo-600 transition"
            title="View last checkpoint tx"
          >
            <ExternalLink className="w-4 h-4" />
          </a>
        )}
      </div>
    </div>
  );
};
