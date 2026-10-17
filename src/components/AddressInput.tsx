import React, { useState } from 'react';
import { Search, X, Sparkles, Check, Loader2 } from 'lucide-react';
import { isAddress, JsonRpcProvider } from 'ethers';
import { SUPPORTED_CHAINS } from '../lib/chains';

interface AddressInputProps {
  value: string;
  onChange: (val: string) => void;
  onResolvedAddress: (address: string) => void;
  onScan: () => void;
  isScanning: boolean;
  disabled?: boolean;
}

// Sample wallet for instant demo testing
const SAMPLE_WALLET = '0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045'; // vitalik.eth

export const AddressInput: React.FC<AddressInputProps> = ({
  value,
  onChange,
  onResolvedAddress,
  onScan,
  isScanning,
  disabled = false,
}) => {
  const [resolvingEns, setResolvingEns] = useState(false);
  const [ensResolvedName, setEnsResolvedName] = useState<string | null>(null);
  const [inputError, setInputError] = useState<string | null>(null);

  // Requirement: Resolve ENS on Ethereum mainnet regardless of the selected chain
  const handleInputChange = async (input: string) => {
    onChange(input);
    setInputError(null);
    setEnsResolvedName(null);

    const trimmed = input.trim();
    if (!trimmed) return;

    if (isAddress(trimmed)) {
      onResolvedAddress(trimmed);
      return;
    }

    const isEnsName = (trimmed as string).endsWith('.eth');
    if (isEnsName) {
      setResolvingEns(true);
      try {
        // Always use Mainnet provider to resolve ENS names
        const mainnetRpc = SUPPORTED_CHAINS[1].rpcUrl;
        const mainnetProvider = new JsonRpcProvider(mainnetRpc);
        const resolved = await mainnetProvider.resolveName(trimmed);

        if (resolved && isAddress(resolved)) {
          setEnsResolvedName(`${trimmed} → ${resolved.slice(0, 6)}...${resolved.slice(-4)}`);
          onResolvedAddress(resolved);
        } else {
          setInputError(`Could not resolve ENS name "${trimmed}" on Mainnet`);
        }
      } catch (err: any) {
        setInputError(`ENS resolution failed: ${err?.message || 'Network error'}`);
      } finally {
        setResolvingEns(false);
      }
    }
  };

  const loadSampleWallet = () => {
    handleInputChange(SAMPLE_WALLET);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isScanning && !disabled && value.trim()) {
      onScan();
    }
  };

  return (
    <div className="w-full space-y-2">
      <div className="relative flex items-center">
        <div className="absolute left-4 text-slate-400">
          <Search className="w-5 h-5" />
        </div>

        <input
          type="text"
          value={value}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled || isScanning}
          placeholder="Paste wallet address (0x...) or ENS name (e.g. vitalik.eth)"
          className="w-full pl-12 pr-28 py-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm text-sm sm:text-base font-mono placeholder:font-sans placeholder:text-slate-400 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition"
        />

        <div className="absolute right-3 flex items-center gap-1.5">
          {resolvingEns && (
            <div className="flex items-center gap-1 text-xs text-indigo-500 px-2 py-1">
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
              <span className="hidden sm:inline">Resolving ENS</span>
            </div>
          )}

          {value && !isScanning && (
            <button
              onClick={() => {
                onChange('');
                onResolvedAddress('');
                setInputError(null);
                setEnsResolvedName(null);
              }}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition"
              title="Clear input"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onScan}
            disabled={isScanning || disabled || !value.trim()}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold text-sm rounded-xl transition shadow-md shadow-indigo-600/20 flex items-center gap-1.5"
          >
            {isScanning ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Scanning</span>
              </>
            ) : (
              <span>Scan</span>
            )}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between text-xs gap-2 px-1">
        <div>
          {ensResolvedName && (
            <span className="text-emerald-600 dark:text-emerald-400 font-medium inline-flex items-center gap-1">
              <Check className="w-3.5 h-3.5" />
              {ensResolvedName}
            </span>
          )}
          {inputError && (
            <span className="text-rose-500 font-medium">{inputError}</span>
          )}
        </div>

        <button
          type="button"
          onClick={loadSampleWallet}
          disabled={isScanning}
          className="inline-flex items-center gap-1.5 text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium py-1 px-2.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Try with sample wallet (vitalik.eth)</span>
        </button>
      </div>
    </div>
  );
};
