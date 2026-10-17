import React, { useState } from 'react';
import type { ApprovalRecord } from '../lib/scanner';
import type { RiskEvaluation } from '../lib/risk';
import { RevokeButton } from './RevokeButton';
import { revokeApproval } from '../lib/revoke';
import { getChainConfig } from '../lib/chains';
import { useToast } from './Toasts';
import {
  ExternalLink,
  Copy,
  Check,
  HelpCircle,
  ShieldCheck,
  Search,
  Zap,
  Loader2,
} from 'lucide-react';
import type { JsonRpcSigner } from 'ethers';

interface ApprovalItemWithRisk {
  approval: ApprovalRecord;
  risk: RiskEvaluation;
}

interface ApprovalTableProps {
  items: ApprovalItemWithRisk[];
  scannedAddress: string;
  connectedAddress: string | null;
  targetChainId: number;
  signer: JsonRpcSigner | null;
  onRevokedSuccess: (token: string, spender: string) => void;
  isLoading: boolean;
}

export const ApprovalTable: React.FC<ApprovalTableProps> = ({
  items,
  scannedAddress,
  connectedAddress,
  targetChainId,
  signer,
  onRevokedSuccess,
  isLoading,
}) => {
  const [copiedAddress, setCopiedAddress] = useState<string | null>(null);
  const [filterLevel, setFilterLevel] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [isQueueRevoking, setIsQueueRevoking] = useState(false);
  const [queueProgress, setQueueProgress] = useState<{ current: number; total: number } | null>(null);

  const { addToast } = useToast();
  const chainConfig = getChainConfig(targetChainId);

  const isOwner =
    Boolean(connectedAddress) &&
    connectedAddress?.toLowerCase() === scannedAddress.toLowerCase();

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedAddress(text);
    setTimeout(() => setCopiedAddress(null), 2000);
  };

  // Filter items
  const filteredItems = items.filter(({ approval, risk }) => {
    const matchesFilter = filterLevel === 'ALL' || risk.level === filterLevel;
    const matchesSearch =
      approval.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      approval.token.toLowerCase().includes(searchQuery.toLowerCase()) ||
      approval.spender.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  const highRiskItems = items.filter((i) => i.risk.level === 'HIGH');

  // "Revoke all high-risk" feature: queues revokes one-by-one with per-row confirmation
  const handleRevokeAllHighRisk = async () => {
    if (!isOwner || !signer) {
      addToast({
        type: 'info',
        title: 'View Only',
        message: 'Please connect the owner wallet to revoke approvals.',
      });
      return;
    }

    if (highRiskItems.length === 0) {
      addToast({
        type: 'info',
        title: 'No High Risk Approvals',
        message: 'There are no high-risk approvals to revoke.',
      });
      return;
    }

    setIsQueueRevoking(true);
    setQueueProgress({ current: 0, total: highRiskItems.length });

    addToast({
      type: 'info',
      title: 'Batch Revocation Started',
      message: `Queueing ${highRiskItems.length} transactions. Please confirm each in your wallet.`,
    });

    for (let i = 0; i < highRiskItems.length; i++) {
      const item = highRiskItems[i];
      setQueueProgress({ current: i + 1, total: highRiskItems.length });

      try {
        await revokeApproval(signer, scannedAddress, item.approval.token, item.approval.spender, targetChainId, targetChainId);
        onRevokedSuccess(item.approval.token, item.approval.spender);
        addToast({
          type: 'success',
          title: `Revoked ${item.approval.symbol}`,
          message: `(${i + 1}/${highRiskItems.length}) Successfully revoked.`,
        });
      } catch (err: any) {
        console.error('Queue revoke step cancelled/failed:', err);
        addToast({
          type: 'error',
          title: 'Queue Stopped',
          message: `Revoke stopped at ${item.approval.symbol}: ${err?.message || 'Transaction rejected'}`,
        });
        break;
      }
    }

    setIsQueueRevoking(false);
    setQueueProgress(null);
  };

  if (isLoading) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-8 text-center space-y-4">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
        <p className="text-slate-600 dark:text-slate-400 font-medium text-sm">
          Analyzing token contracts and verifying allowances...
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl overflow-hidden shadow-sm transition">
      {/* Table Header Controls */}
      <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
            Active Approvals ({filteredItems.length})
          </h3>

          {/* Revoke All High Risk Button */}
          {highRiskItems.length > 0 && isOwner && (
            <button
              onClick={handleRevokeAllHighRisk}
              disabled={isQueueRevoking}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md shadow-rose-600/20 transition flex items-center gap-1.5"
            >
              {isQueueRevoking ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>
                    Revoking ({queueProgress?.current}/{queueProgress?.total})...
                  </span>
                </>
              ) : (
                <>
                  <Zap className="w-3.5 h-3.5" />
                  <span>Revoke All High-Risk ({highRiskItems.length})</span>
                </>
              )}
            </button>
          )}
        </div>

        {/* Search and Filters */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 sm:w-48">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search token..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl text-xs text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1 bg-slate-50 dark:bg-slate-800/60 p-1 border border-slate-200 dark:border-slate-700/60 rounded-xl text-xs">
            {['ALL', 'HIGH', 'MEDIUM', 'INFO'].map((lvl) => (
              <button
                key={lvl}
                onClick={() => setFilterLevel(lvl)}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  filterLevel === lvl
                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                {lvl}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Empty State */}
      {filteredItems.length === 0 ? (
        <div className="p-12 text-center space-y-3">
          <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <ShieldCheck className="w-7 h-7" />
          </div>
          <h4 className="text-base font-bold text-slate-800 dark:text-slate-200">
            No active approvals, nice!
          </h4>
          <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto">
            {items.length === 0
              ? 'This wallet has no open ERC-20 allowances in the inspected block window.'
              : 'No approvals match your current search/filter.'}
          </p>
        </div>
      ) : (
        /* Table Layout */
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/75 dark:bg-slate-800/40 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4 sm:px-6">Token</th>
                <th className="py-3 px-4 sm:px-6">
                  <div className="flex items-center gap-1 group cursor-help">
                    <span>Spender Contract</span>
                    <span title="The authorized contract address that has been granted permission to spend your tokens.">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                    </span>
                  </div>
                </th>
                <th className="py-3 px-4 sm:px-6">
                  <div className="flex items-center gap-1 group cursor-help">
                    <span>Allowance</span>
                    <span title="Maximum amount of tokens the spender is permitted to withdraw without another signature.">
                      <HelpCircle className="w-3.5 h-3.5 text-slate-400" />
                    </span>
                  </div>
                </th>
                <th className="py-3 px-4 sm:px-6">Risk Assessment</th>
                <th className="py-3 px-4 sm:px-6 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 font-sans">
              {filteredItems.map(({ approval, risk }) => (
                <tr
                  key={`${approval.token}-${approval.spender}`}
                  className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors"
                >
                  {/* Token */}
                  <td className="py-4 px-4 sm:px-6">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs shrink-0">
                        {approval.symbol.slice(0, 3)}
                      </div>
                      <div>
                        <span className="font-bold text-slate-900 dark:text-slate-100 block">
                          {approval.symbol}
                        </span>
                        <div className="flex items-center gap-1 text-[11px] font-mono text-slate-400">
                          <span>
                            {approval.token.slice(0, 6)}...{approval.token.slice(-4)}
                          </span>
                          <button
                            onClick={() => handleCopy(approval.token)}
                            className="hover:text-slate-600 dark:hover:text-slate-200"
                            title="Copy token address"
                          >
                            {copiedAddress === approval.token ? (
                              <Check className="w-3 h-3 text-emerald-500" />
                            ) : (
                              <Copy className="w-3 h-3" />
                            )}
                          </button>
                          <a
                            href={`${chainConfig.explorerUrl}/address/${approval.token}`}
                            target="_blank"
                            rel="noreferrer"
                            className="hover:text-indigo-500"
                            title="View on explorer"
                          >
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Spender */}
                  <td className="py-4 px-4 sm:px-6">
                    <div>
                      <div className="flex items-center gap-1 font-mono text-xs text-slate-700 dark:text-slate-300">
                        <span>
                          {approval.spender.slice(0, 8)}...{approval.spender.slice(-6)}
                        </span>
                        <button
                          onClick={() => handleCopy(approval.spender)}
                          className="hover:text-slate-600 dark:hover:text-slate-200 text-slate-400"
                          title="Copy spender address"
                        >
                          {copiedAddress === approval.spender ? (
                            <Check className="w-3 h-3 text-emerald-500" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                        <a
                          href={`${chainConfig.explorerUrl}/address/${approval.spender}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-slate-400 hover:text-indigo-500"
                          title="View on explorer"
                        >
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      </div>
                      <span className="text-[11px] text-slate-400">
                        Last approved: block #{approval.lastUpdatedBlock.toLocaleString()}
                      </span>
                    </div>
                  </td>

                  {/* Allowance */}
                  <td className="py-4 px-4 sm:px-6 font-mono font-medium">
                    {approval.isUnlimited ? (
                      <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-bold bg-rose-50 dark:bg-rose-950/40 px-2.5 py-0.5 rounded-full border border-rose-200 dark:border-rose-900/50">
                        Unlimited
                      </span>
                    ) : (
                      <span className="text-slate-800 dark:text-slate-200">
                        {approval.allowanceFormatted} {approval.symbol}
                      </span>
                    )}
                  </td>

                  {/* Risk Badge and Plain-English Explanation */}
                  <td className="py-4 px-4 sm:px-6 max-w-xs">
                    <div className="space-y-1">
                      <span
                        className={`inline-block px-2.5 py-0.5 rounded-md font-semibold text-[11px] border ${risk.badgeColor.bg} ${risk.badgeColor.text} ${risk.badgeColor.border}`}
                      >
                        {risk.badgeText}
                      </span>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-snug">
                        {risk.explanation}
                      </p>
                    </div>
                  </td>

                  {/* Action (Revoke) */}
                  <td className="py-4 px-4 sm:px-6 text-right">
                    <RevokeButton
                      tokenAddress={approval.token}
                      spenderAddress={approval.spender}
                      symbol={approval.symbol}
                      scannedAddress={scannedAddress}
                      connectedAddress={connectedAddress}
                      targetChainId={targetChainId}
                      signer={signer}
                      onRevokedSuccess={onRevokedSuccess}
                      isQueueActive={isQueueRevoking}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

