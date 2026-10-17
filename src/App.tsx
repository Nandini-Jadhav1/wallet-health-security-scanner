import { useState, useEffect } from 'react';
import { AddressInput } from './components/AddressInput';
import { ChainSelect } from './components/ChainSelect';
import { ProgressBar } from './components/ProgressBar';
import { HealthScore } from './components/HealthScore';
import { ApprovalTable } from './components/ApprovalTable';
import { DemoLab } from './components/DemoLab';
import { SaveReport } from './components/SaveReport';
import { ToastProvider, useToast } from './components/Toasts';
import { fetchApprovals } from './lib/scanner';
import type { ApprovalRecord, ScanProgress, ScannedTokenInfo } from './lib/scanner';
import { scoreApproval, calculateHealthScore } from './lib/risk';
import type { RiskEvaluation, HealthScoreResult } from './lib/risk';
import { useWallet } from './hooks/useWallet';
import { getChainConfig, DEFAULT_CHAIN_ID } from './lib/chains';
import { MAINNET_POPULAR_TOKENS } from './lib/knownTokens';
import { getContractAddresses } from './contracts/addresses';
import { JsonRpcProvider, isAddress, getAddress } from 'ethers';
import {
  ShieldCheck,
  Sun,
  Moon,
  Wallet,
  FlaskConical,
  Calendar,
  AlertCircle,
  RefreshCw,
  Plus,
  X,
  Coins,
} from 'lucide-react';

interface ApprovalWithRisk {
  approval: ApprovalRecord;
  risk: RiskEvaluation;
}

function MainApp() {
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');
  const [activeTab, setActiveTab] = useState<'scanner' | 'demolab'>('scanner');

  // Chain state
  const [selectedChainId, setSelectedChainId] = useState<number>(DEFAULT_CHAIN_ID);

  // Address inputs
  const [rawInput, setRawInput] = useState<string>('');
  const [scannedAddress, setScannedAddress] = useState<string>('');

  // Custom token tracking
  const [customTokens, setCustomTokens] = useState<string[]>([]);
  const [customTokenInput, setCustomTokenInput] = useState<string>('');

  // Wallet connection (via useWallet hook — handles MetaMask, listeners, etc.)
  const wallet = useWallet();
  const connectedAddress = wallet.address;
  const signer = wallet.signer;

  // Scan settings & progress
  const [fullHistory, setFullHistory] = useState<boolean>(false);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    currentChunk: 0,
    totalChunks: 0,
    percent: 0,
    currentBlock: 0,
    foundEvents: 0,
    message: '',
  });

  // Results
  const [hasScanned, setHasScanned] = useState<boolean>(false);
  const [approvalsList, setApprovalsList] = useState<ApprovalWithRisk[]>([]);
  const [healthScore, setHealthScore] = useState<HealthScoreResult | null>(null);
  const [scannedRangeInfo, setScannedRangeInfo] = useState<{
    fromBlock: number;
    toBlock: number;
    daysCovered: number;
  } | null>(null);
  const [scannedTokens, setScannedTokens] = useState<ScannedTokenInfo[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { addToast } = useToast();
  const currentChain = getChainConfig(selectedChainId);

  // Initialize theme
  useEffect(() => {
    const saved = localStorage.getItem('wallet_health_theme') as 'dark' | 'light' | null;
    const initialTheme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    setTheme(initialTheme);
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    localStorage.setItem('wallet_health_theme', next);
    if (next === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  };

  // Connect Web3 Wallet — delegates to useWallet hook
  const handleConnectWallet = async () => {
    await wallet.connect();
  };

  // Sync wallet address into the scan input when first connected
  useEffect(() => {
    if (connectedAddress && !rawInput) {
      setRawInput(connectedAddress);
      setScannedAddress(connectedAddress);
    }
  }, [connectedAddress]); // eslint-disable-line

  // Add custom token to scan list
  const handleAddCustomToken = () => {
    const addr = customTokenInput.trim();
    if (!addr || !isAddress(addr)) {
      addToast({
        type: 'error',
        title: 'Invalid Token Address',
        message: 'Please paste a valid ERC-20 token address (0x...).',
      });
      return;
    }

    const checksummed = getAddress(addr);
    if (customTokens.some((t) => t.toLowerCase() === checksummed.toLowerCase())) {
      addToast({
        type: 'info',
        title: 'Token Already Added',
        message: 'This token address is already in your check list.',
      });
      return;
    }

    setCustomTokens((prev) => [...prev, checksummed]);
    setCustomTokenInput('');
    addToast({
      type: 'success',
      title: 'Token Added',
      message: `Added token ${checksummed.slice(0, 6)}...${checksummed.slice(-4)}`,
    });
  };

  const handleRemoveCustomToken = (tokenToRemove: string) => {
    setCustomTokens((prev) => prev.filter((t) => t.toLowerCase() !== tokenToRemove.toLowerCase()));
  };

  // Determine active tokens for the current chain view
  const defaultTokensForChain =
    selectedChainId === 1
      ? MAINNET_POPULAR_TOKENS.map((t) => ({ address: t.address, symbol: t.symbol, name: t.name }))
      : selectedChainId === 11155111
      ? (() => {
          const dep = getContractAddresses(11155111);
          return dep.demoToken && dep.demoToken !== '0x0000000000000000000000000000000000000000'
            ? [{ address: dep.demoToken, symbol: 'DEMO', name: 'Demo Token' }]
            : [];
        })()
      : [];

  // Perform Scan
  const executeScan = async (targetAddressOverride?: string) => {
    const target = (targetAddressOverride || scannedAddress || rawInput).trim();

    if (!target || !isAddress(target)) {
      addToast({
        type: 'error',
        title: 'Invalid Address',
        message: 'Please provide a valid Ethereum checksum address or resolved ENS.',
      });
      return;
    }


    // Guard: On Sepolia, check if DemoToken is deployed (not zero address)
    if (selectedChainId === 11155111) {
      const dep = getContractAddresses(11155111);
      if (!dep.demoToken || dep.demoToken === '0x0000000000000000000000000000000000000000') {
        addToast({
          type: 'error',
          title: 'Contracts Not Deployed',
          message: 'Deploy contracts first. Run: npx hardhat run scripts/deploy.cjs --network sepolia',
        });
        return;
      }
    }

    setScannedAddress(target);
    setIsScanning(true);
    setErrorMessage(null);
    setScanProgress({
      currentChunk: 0,
      totalChunks: 0,
      percent: 5,
      currentBlock: 0,
      foundEvents: 0,
      message: 'Connecting to RPC provider...',
    });

    try {
      const provider = new JsonRpcProvider(currentChain.rpcUrl);

      // Determine tokens to pass
      let tokensToPass: string[] | undefined = undefined;
      if (customTokens.length > 0) {
        const baseAddrs = defaultTokensForChain.map((t) => t.address);
        tokensToPass = Array.from(new Set([...baseAddrs, ...customTokens]));
      }

      // Execute token-scoped 7-step scanning engine
      const scanResult = await fetchApprovals(
        provider,
        target,
        (progress) => {
          setScanProgress(progress);
        },
        { fullHistory, tokens: tokensToPass }
      );

      setScannedRangeInfo(scanResult.scannedRange);
      setScannedTokens(scanResult.scannedTokens);

      // Step: Risk scoring for each approval
      const evaluatedItems: ApprovalWithRisk[] = [];
      for (const item of scanResult.approvals) {
        const risk = await scoreApproval(provider, item);
        evaluatedItems.push({ approval: item, risk });
      }

      setApprovalsList(evaluatedItems);

      // Calculate Wallet Health Score
      const score = calculateHealthScore(evaluatedItems.map((i) => i.risk));
      setHealthScore(score);
      setHasScanned(true);

      if (scanResult.errors.length > 0) {
        addToast({
          type: 'info',
          title: 'Scan Finished with Warnings',
          message: `Encountered ${scanResult.errors.length} RPC block-range limitation notices.`,
        });
      } else {
        addToast({
          type: 'success',
          title: 'Scan Complete',
          message: `Found ${evaluatedItems.length} active approvals. Health score: ${score.score}/100.`,
        });
      }
    } catch (err: any) {
      console.error('Scan execution error:', err);
      const errMsg = err?.message || 'Failed to scan blockchain logs.';
      setErrorMessage(errMsg);
      addToast({
        type: 'error',
        title: 'Scan Error',
        message: errMsg.length > 90 ? `${errMsg.slice(0, 90)}...` : errMsg,
      });
    } finally {
      setIsScanning(false);
    }
  };

  // Handle successful revoke
  const handleRevokedSuccess = (token: string, spender: string) => {
    setApprovalsList((prev) => {
      const updated = prev.filter(
        (item) =>
          !(
            item.approval.token.toLowerCase() === token.toLowerCase() &&
            item.approval.spender.toLowerCase() === spender.toLowerCase()
          )
      );

      // Recompute health score immediately
      const newScore = calculateHealthScore(updated.map((i) => i.risk));
      setHealthScore(newScore);
      return updated;
    });
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-slate-950 transition-colors duration-200">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border-b border-slate-200 dark:border-slate-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-600/20">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-slate-100 block leading-tight">
                Wallet Health
              </span>
              <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 dark:text-indigo-400">
                Security Scanner
              </span>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav className="hidden md:flex items-center bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl text-xs font-semibold">
            <button
              onClick={() => setActiveTab('scanner')}
              className={`px-4 py-1.5 rounded-lg transition ${
                activeTab === 'scanner'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              Approvals Scanner
            </button>
            <button
              onClick={() => {
                setActiveTab('demolab');
                setSelectedChainId(11155111);
              }}
              className={`px-4 py-1.5 rounded-lg flex items-center gap-1.5 transition ${
                activeTab === 'demolab'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
              }`}
            >
              <FlaskConical className="w-3.5 h-3.5 text-amber-500" />
              <span>Demo Lab (Sepolia)</span>
            </button>
          </nav>

          {/* Chain Selector & Actions */}
          <div className="flex items-center gap-2">
            <ChainSelect
              selectedChainId={selectedChainId}
              onSelectChain={(id) => {
                setSelectedChainId(id);
                setHasScanned(false);
                setApprovalsList([]);
              }}
            />

            {/* ConnectButton — shows connecting state, error, switch chain, disconnect */}
            <div className="flex items-center gap-2">
              {connectedAddress ? (
                <>
                  {/* Show "Switch to Sepolia" if wallet is on wrong chain */}
                  {wallet.chainId !== null && wallet.chainId !== selectedChainId && (
                    <button
                      onClick={() => wallet.switchChain(selectedChainId)}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 border border-amber-300 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900/40 transition"
                    >
                      Switch to {getChainConfig(selectedChainId).shortName}
                    </button>
                  )}
                  <span className="text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5" />
                    {connectedAddress.slice(0, 6)}...{connectedAddress.slice(-4)}
                  </span>
                  <button
                    onClick={() => wallet.disconnect()}
                    className="text-[10px] font-medium text-slate-400 hover:text-rose-500 transition"
                    title="Disconnect"
                  >
                    ✕
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnectWallet}
                  disabled={wallet.connecting}
                  className="text-xs font-semibold px-3 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-70 text-white shadow-sm shadow-indigo-600/20 flex items-center gap-1.5 transition"
                >
                  <Wallet className="w-3.5 h-3.5" />
                  <span>{wallet.connecting ? "Check MetaMask popup..." : "Connect MetaMask"}</span>
                </button>
              )}
            </div>
            {/* Wallet error toast below header */}
            {wallet.error && (
              <div className="absolute top-full left-0 right-0 bg-rose-50 dark:bg-rose-950/60 border-b border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-[11px] px-4 py-1.5 text-center">
                {wallet.error}
              </div>
            )}

            <button
              onClick={toggleTheme}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition"
              title="Toggle color theme"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Mobile Tab Switcher */}
        <div className="flex md:hidden border-t border-slate-100 dark:border-slate-800/80 px-4 py-2 bg-slate-50/50 dark:bg-slate-900/50">
          <div className="grid grid-cols-2 gap-1 w-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveTab('scanner')}
              className={`py-1.5 rounded-lg text-center ${
                activeTab === 'scanner'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Scanner
            </button>
            <button
              onClick={() => {
                setActiveTab('demolab');
                setSelectedChainId(11155111);
              }}
              className={`py-1.5 rounded-lg text-center ${
                activeTab === 'demolab'
                  ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              Demo Lab (Sepolia)
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {activeTab === 'scanner' ? (
          <>
            {/* Hero & Scanner Controls Card */}
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
              <div className="space-y-2">
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-slate-100">
                  Inspect & Revoke ERC-20 Approvals
                </h1>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 max-w-2xl">
                  Contracts with open allowances can withdraw your tokens at any time. Paste your
                  wallet address below to audit active permissions and eliminate high-risk exposures.
                </p>
              </div>

              {/* Input & Scan Form */}
              <div className="space-y-4">
                <AddressInput
                  value={rawInput}
                  onChange={(val) => setRawInput(val)}
                  onResolvedAddress={(addr) => setScannedAddress(addr)}
                  onScan={() => executeScan()}
                  isScanning={isScanning}
                />

                {/* Scoped Tokens & "Check Another Token" Input */}
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-800 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-300">
                      <Coins className="w-4 h-4 text-indigo-500" />
                      <span>Tokens Scanned on {currentChain.name}:</span>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5">
                      {defaultTokensForChain.map((t) => (
                        <span
                          key={t.address}
                          className="px-2 py-0.5 rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 text-[11px] font-semibold border border-indigo-200 dark:border-indigo-900/60"
                          title={t.address}
                        >
                          {t.symbol}
                        </span>
                      ))}

                      {customTokens.map((addr) => (
                        <span
                          key={addr}
                          className="px-2 py-0.5 rounded-md bg-purple-50 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 text-[11px] font-semibold border border-purple-200 dark:border-purple-900/60 flex items-center gap-1"
                        >
                          <span>{addr.slice(0, 6)}...{addr.slice(-4)}</span>
                          <button
                            onClick={() => handleRemoveCustomToken(addr)}
                            className="text-purple-400 hover:text-purple-600 dark:hover:text-purple-200"
                            title="Remove token"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* "Check another token" Input Row */}
                  <div className="flex flex-col sm:flex-row items-center gap-2">
                    <div className="relative flex-1 w-full">
                      <input
                        type="text"
                        value={customTokenInput}
                        onChange={(e) => setCustomTokenInput(e.target.value)}
                        placeholder="Check another token (paste ERC-20 contract 0x...)"
                        disabled={isScanning}
                        className="w-full text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleAddCustomToken();
                          }
                        }}
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCustomToken}
                      disabled={isScanning || !customTokenInput.trim()}
                      className="w-full sm:w-auto px-3 py-2 rounded-xl text-xs font-semibold bg-slate-200 hover:bg-slate-300 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-800 dark:text-slate-100 flex items-center justify-center gap-1 transition disabled:opacity-50"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>Add Token</span>
                    </button>
                  </div>

                  
                </div>

                {/* Scan Options Row */}
                <div className="flex flex-wrap items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-3 pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                    <span>
                      Scan Window:{' '}
                      <strong className="text-slate-700 dark:text-slate-300">
                        {fullHistory ? 'Full Blockchain History' : 'Last ~180 Days (Standard Audit)'}
                      </strong>
                    </span>
                  </div>

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={fullHistory}
                      onChange={(e) => setFullHistory(e.target.checked)}
                      disabled={isScanning}
                      className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span className="font-medium hover:text-slate-700 dark:hover:text-slate-200 transition">
                      Scan full history (slower)
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Scanning Progress */}
            {isScanning && (
              <ProgressBar progress={scanProgress} isScanning={isScanning} />
            )}

            {/* General RPC Error State */}
            {errorMessage && (
              <div className="p-4 sm:p-5 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/50 text-rose-900 dark:text-rose-200 text-xs flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="font-bold text-sm">Scan Encountered an Issue</h4>
                  <p>{errorMessage}</p>
                </div>
              </div>
            )}

            

            {/* Scanned Window & Tokens Summary Bar */}
            {hasScanned && scannedRangeInfo && (
              <div className="flex flex-wrap items-center justify-between text-xs px-2 text-slate-500 dark:text-slate-400 gap-2">
                <span>
                  Scanned{' '}
                  <strong className="text-slate-700 dark:text-slate-200">
                    {scannedTokens.map((t) => t.symbol).join(', ') || '0 tokens'}
                  </strong>{' '}
                  across blocks{' '}
                  <strong className="font-mono text-slate-700 dark:text-slate-300">
                    {scannedRangeInfo.fromBlock.toLocaleString()}
                  </strong>{' '}
                  to{' '}
                  <strong className="font-mono text-slate-700 dark:text-slate-300">
                    {scannedRangeInfo.toBlock.toLocaleString()}
                  </strong>{' '}
                  ({scannedRangeInfo.daysCovered === 0 ? 'Full History' : `Last ~${scannedRangeInfo.daysCovered} days`})
                </span>
                <button
                  onClick={() => executeScan()}
                  disabled={isScanning}
                  className="inline-flex items-center gap-1 hover:text-indigo-600 dark:hover:text-indigo-400 transition"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Rescan</span>
                </button>
              </div>
            )}

            {/* Health Score Summary Card */}
            {hasScanned && healthScore && (
              <HealthScore scoreResult={healthScore} />
            )}

            {/* On-Chain Checkpoint Card */}
            {hasScanned && (
              <SaveReport
                signer={signer}
                connectedAddress={connectedAddress}
                scannedAddress={scannedAddress}
                targetChainId={selectedChainId}
                activeApprovalsCount={approvalsList.length}
                highRiskCount={approvalsList.filter((i) => i.risk.level === 'HIGH').length}
              />
            )}

            {/* Approvals Table */}
            {hasScanned && (
              <ApprovalTable
                items={approvalsList}
                scannedAddress={scannedAddress}
                connectedAddress={connectedAddress}
                targetChainId={selectedChainId}
                signer={signer}
                onRevokedSuccess={handleRevokedSuccess}
                isLoading={isScanning}
              />
            )}
          </>
        ) : (
          /* Demo Lab Tab */
          <DemoLab
            signer={signer}
            connectedAddress={connectedAddress}
            onTriggerScan={(addr) => {
              setRawInput(addr);
              setScannedAddress(addr);
              setActiveTab('scanner');
              executeScan(addr);
            }}
          />
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-6 text-center text-xs text-slate-400">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-3">
          <span>Wallet Health Check &bull; Web3 Security & Revoke Engine</span>
          <span>Open-source security tool &bull; Never requests private keys or seed phrases</span>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <MainApp />
    </ToastProvider>
  );
}

