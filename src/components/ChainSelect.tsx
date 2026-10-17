import React from 'react';
import { SUPPORTED_CHAINS } from '../lib/chains';
import { Globe } from 'lucide-react';

interface ChainSelectProps {
  selectedChainId: number;
  onSelectChain: (chainId: number) => void;
  disabled?: boolean;
}

export const ChainSelect: React.FC<ChainSelectProps> = ({
  selectedChainId,
  onSelectChain,
  disabled = false,
}) => {
  return (
    <div className="relative inline-flex items-center">
      <div className="flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl px-3 py-2.5 shadow-sm transition hover:border-slate-300 dark:hover:border-slate-700">
        <Globe className="w-4 h-4 text-slate-500 dark:text-slate-400" />
        <select
          value={selectedChainId}
          onChange={(e) => onSelectChain(Number(e.target.value))}
          disabled={disabled}
          className="bg-transparent font-medium text-sm text-slate-800 dark:text-slate-200 outline-none cursor-pointer disabled:cursor-not-allowed pr-2"
        >
          {Object.values(SUPPORTED_CHAINS).map((chain) => (
            <option
              key={chain.id}
              value={chain.id}
              className="bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100"
            >
              {chain.name} {chain.isTestnet ? '(Demo/Testnet)' : ''}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
};
