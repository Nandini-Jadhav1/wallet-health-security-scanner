import React, { useState, useEffect } from 'react';
import { getContractAddresses } from '../contracts/addresses';
import { DEMO_TOKEN_ABI, DEMO_SPENDER_ABI } from '../contracts/abis';
import { useToast } from './Toasts';
import { ensureWalletNetwork } from '../lib/revoke';
import { getChainConfig } from '../lib/chains';
import {
  Contract,
  JsonRpcSigner,
  parseEther,
  formatEther,
  MaxUint256,
  isAddress,
} from 'ethers';
import {
  FlaskConical,
  Coins,
  ShieldAlert,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Loader2,
  ExternalLink,
  Info,
} from 'lucide-react';

interface DemoLabProps {
  signer: JsonRpcSigner | null;
  connectedAddress: string | null;
  onTriggerScan: (address: string) => void;
}

export const DemoLab: React.FC<DemoLabProps> = ({
  signer,
  connectedAddress,
  onTriggerScan,
}) => {
  const [tokenAddress, setTokenAddress] = useState(
    getContractAddresses(11155111).demoToken
  );
  const [spenderAddress, setSpenderAddress] = useState(
    getContractAddresses(11155111).demoSpender
  );

  const [userBalance, setUserBalance] = useState<string>('0');
  const [spenderBalance, setSpenderBalance] = useState<string>('0');
  const [currentAllowance, setCurrentAllowance] = useState<string>('0');
  const [isLoadingBalances, setIsLoadingBalances] = useState(false);

  const [activeStep, setActiveStep] = useState<number>(1);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [pullSimulationResult, setPullSimulationResult] = useState<{
    success: boolean;
    message: string;
    txHash?: string;
  } | null>(null);

  const { addToast } = useToast();
  const sepoliaConfig = getChainConfig(11155111);

  const isConfigured =
    isAddress(tokenAddress) &&
    isAddress(spenderAddress) &&
    tokenAddress !== '0x0000000000000000000000000000000000000000' &&
    spenderAddress !== '0x0000000000000000000000000000000000000000';

  // Load balances from Sepolia contracts
  const refreshBalances = async () => {
    if (!signer || !connectedAddress || !isConfigured) return;

    try {
      setIsLoadingBalances(true);
      const tokenContract = new Contract(tokenAddress, DEMO_TOKEN_ABI, signer);
      const uBal = await tokenContract.balanceOf(connectedAddress);
      const sBal = await tokenContract.balanceOf(spenderAddress);
      const allow = await tokenContract.allowance(connectedAddress, spenderAddress);

      setUserBalance(formatEther(uBal));
      setSpenderBalance(formatEther(sBal));
      setCurrentAllowance(
        allow >= 2n ** 255n ? 'Unlimited' : formatEther(allow)
      );
    } catch (err) {
      console.warn('Error fetching demo lab balances:', err);
    } finally {
      setIsLoadingBalances(false);
    }
  };

  useEffect(() => {
    if (signer && connectedAddress && isConfigured) {
      refreshBalances();
    }
  }, [signer, connectedAddress, tokenAddress, spenderAddress, isConfigured]);

  // Step 1: Claim Faucet Tokens
  const handleClaimFaucet = async () => {
    if (!signer || !connectedAddress) {
      addToast({ type: 'info', title: 'Connect Wallet', message: 'Connect your wallet on Sepolia first.' });
      return;
    }
    try {
      setActionLoading('faucet');
      await ensureWalletNetwork(11155111);
      const contract = new Contract(tokenAddress, DEMO_TOKEN_ABI, signer);
      const tx = await contract.faucet();
      addToast({
        type: 'pending',
        title: 'Claiming Faucet Tokens',
        message: 'Minting 1,000 DEMO tokens...',
        link: { url: `${sepoliaConfig.explorerUrl}/tx/${tx.hash}`, text: 'View Tx' },
      });
      await tx.wait(1);
      addToast({ type: 'success', title: 'Faucet Claimed!', message: '1,000 DEMO tokens added to your wallet.' });
      await refreshBalances();
      setActiveStep(2);
    } catch (err: any) {
      const msg = err?.message || 'Faucet claim failed';
      addToast({ type: 'error', title: 'Faucet Error', message: msg.includes('FaucetCooldownActive') ? 'Faucet cooldown active. Please wait 1 minute.' : msg });
    } finally {
      setActionLoading(null);
    }
  };

  // Step 2: Approve Unlimited
  const handleApproveUnlimited = async () => {
    if (!signer || !connectedAddress) return;
    try {
      setActionLoading('approve');
      await ensureWalletNetwork(11155111);
      const contract = new Contract(tokenAddress, DEMO_TOKEN_ABI, signer);
      const tx = await contract.approve(spenderAddress, MaxUint256);
      addToast({
        type: 'pending',
        title: 'Approving Unlimited',
        message: 'Granting unlimited allowance to DemoSpender...',
        link: { url: `${sepoliaConfig.explorerUrl}/tx/${tx.hash}`, text: 'View Tx' },
      });
      await tx.wait(1);
      addToast({ type: 'success', title: 'Unlimited Approved!', message: 'DemoSpender now has unlimited permission.' });
      await refreshBalances();
      setActiveStep(3);
    } catch (err: any) {
      addToast({ type: 'error', title: 'Approve Failed', message: err?.message || 'Transaction rejected' });
    } finally {
      setActionLoading(null);
    }
  };

  // Step 3: Trigger Scan
  const handleInspectInScanner = () => {
    if (connectedAddress) {
      onTriggerScan(connectedAddress);
      setActiveStep(4);
    }
  };

  // Step 4: Simulate Spender Pull
  const handleSimulatePull = async () => {
    if (!signer || !connectedAddress) return;
    try {
      setActionLoading('pull');
      setPullSimulationResult(null);
      await ensureWalletNetwork(11155111);

      const pullAmount = parseEther('200'); // Pull 200 DEMO
      const spenderContract = new Contract(spenderAddress, DEMO_SPENDER_ABI, signer);
      const tx = await spenderContract.pull(tokenAddress, connectedAddress, pullAmount);

      addToast({
        type: 'pending',
        title: 'Spender Pull Executing',
        message: 'DemoSpender contract is calling transferFrom...',
        link: { url: `${sepoliaConfig.explorerUrl}/tx/${tx.hash}`, text: 'View Tx' },
      });

      await tx.wait(1);
      await refreshBalances();

      setPullSimulationResult({
        success: true,
        message: 'Dapp unilaterally pulled 200 DEMO tokens from your wallet without asking for a balance transfer confirmation!',
        txHash: tx.hash,
      });

      addToast({
        type: 'error',
        title: 'Tokens Pulled by Spender!',
        message: '200 DEMO was withdrawn by DemoSpender using your unlimited allowance.',
      });

      setActiveStep(5);
    } catch (err: any) {
      console.warn('Pull failed/reverted:', err);
      setPullSimulationResult({
        success: false,
        message: 'Pull reverted! The contract could not withdraw tokens (allowance is 0 or insufficient). Revoking protected you!',
      });
      addToast({
        type: 'success',
        title: 'Pull Reverted Safely!',
        message: 'The spender failed to withdraw any tokens.',
      });
    } finally {
      setActionLoading(null);
    }
  };

  // Step 5: Revoke Approval
  const handleRevoke = async () => {
    if (!signer || !connectedAddress) return;
    try {
      setActionLoading('revoke');
      await ensureWalletNetwork(11155111);
      const contract = new Contract(tokenAddress, DEMO_TOKEN_ABI, signer);
      const tx = await contract.approve(spenderAddress, 0n);

      addToast({
        type: 'pending',
        title: 'Revoking Approval',
        message: 'Setting allowance to strictly 0...',
        link: { url: `${sepoliaConfig.explorerUrl}/tx/${tx.hash}`, text: 'View Tx' },
      });

      await tx.wait(1);
      await refreshBalances();
      addToast({
        type: 'success',
        title: 'Approval Revoked!',
        message: 'Allowance set to 0. Try simulating a pull now to watch it fail!',
      });
    } catch (err: any) {
      addToast({ type: 'error', title: 'Revoke Failed', message: err?.message || 'Transaction rejected' });
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header Banner */}
      <div className="bg-gradient-to-r from-indigo-900/40 via-purple-900/30 to-slate-900/40 border border-indigo-500/30 rounded-3xl p-6 sm:p-8 backdrop-blur-md">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="p-2 rounded-xl bg-indigo-600 text-white">
                <FlaskConical className="w-5 h-5" />
              </span>
              <h2 className="text-xl sm:text-2xl font-bold text-white">
                Sepolia Demo Lab
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-slate-300 max-w-xl">
              An interactive test playground on Sepolia. Mint test tokens, grant an unlimited
              approval, watch a mock dapp pull your funds, and prove that revoking makes you 100% safe.
            </p>
          </div>

          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-indigo-500/20 text-indigo-300 border border-indigo-400/30 shrink-0">
            Chain: Sepolia (11155111)
          </span>
        </div>

        {/* Contract Address Configuration */}
        {!isConfigured && (
          <div className="mt-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-3">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <Info className="w-4 h-4 shrink-0" />
              <span>Remix Contract Addresses Configuration</span>
            </div>
            <p>
              Paste your deployed Sepolia contract addresses below (or edit <code className="bg-black/30 px-1 py-0.5 rounded">src/contracts/addresses.ts</code>):
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">
                  DemoToken Address:
                </label>
                <input
                  type="text"
                  value={tokenAddress}
                  onChange={(e) => setTokenAddress(e.target.value.trim())}
                  placeholder="0x..."
                  className="w-full px-3 py-1.5 bg-black/40 border border-slate-700 rounded-xl font-mono text-xs text-white"
                />
              </div>
              <div>
                <label className="block text-[11px] font-mono text-slate-300 mb-1">
                  DemoSpender Address:
                </label>
                <input
                  type="text"
                  value={spenderAddress}
                  onChange={(e) => setSpenderAddress(e.target.value.trim())}
                  placeholder="0x..."
                  className="w-full px-3 py-1.5 bg-black/40 border border-slate-700 rounded-xl font-mono text-xs text-white"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Live Balance Dashboard */}
      {isConfigured && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 font-medium flex items-center justify-between">
              <span>Your DEMO Balance</span>
              {isLoadingBalances && <Loader2 className="w-3 h-3 animate-spin text-slate-400" />}
            </span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {parseFloat(userBalance).toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-indigo-500">DEMO</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-spec">
            <span className="text-xs text-slate-400 font-medium">DemoSpender Holding</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span className="text-2xl font-bold font-mono text-slate-900 dark:text-slate-100">
                {parseFloat(spenderBalance).toLocaleString()}
              </span>
              <span className="text-xs font-semibold text-purple-500">DEMO</span>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 shadow-sm">
            <span className="text-xs text-slate-400 font-medium">Active Allowance to Spender</span>
            <div className="flex items-baseline gap-2 mt-1">
              <span
                className={`text-2xl font-bold font-mono ${
                  currentAllowance === 'Unlimited'
                    ? 'text-rose-500'
                    : 'text-slate-900 dark:text-slate-100'
                }`}
              >
                {currentAllowance}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Guided 5-Step Playground */}
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
        <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
          Step-by-Step Security Walkthrough
        </h3>

        <div className="space-y-4">
          {/* STEP 1 */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              activeStep === 1
                ? 'border-indigo-500/50 bg-indigo-50/30 dark:bg-indigo-950/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                    1
                  </span>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Get Test Tokens (Faucet)
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mints 1,000 DEMO tokens to your wallet to test with.
                </p>
              </div>

              <button
                onClick={handleClaimFaucet}
                disabled={actionLoading === 'faucet' || !isConfigured}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-2"
              >
                {actionLoading === 'faucet' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Coins className="w-4 h-4" />
                )}
                <span>Get 1,000 DEMO</span>
              </button>
            </div>
          </div>

          {/* STEP 2 */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              activeStep === 2
                ? 'border-indigo-500/50 bg-indigo-50/30 dark:bg-indigo-950/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                    2
                  </span>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Approve Unlimited to DemoSpender
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Calls <code className="font-mono">approve(DemoSpender, MaxUint256)</code>.
                  Simulates standard DEX/Dapp setup.
                </p>
              </div>

              <button
                onClick={handleApproveUnlimited}
                disabled={actionLoading === 'approve' || !isConfigured}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 active:bg-rose-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-2"
              >
                {actionLoading === 'approve' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldAlert className="w-4 h-4" />
                )}
                <span>Approve Unlimited</span>
              </button>
            </div>
          </div>

          {/* STEP 3 */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              activeStep === 3
                ? 'border-indigo-500/50 bg-indigo-50/30 dark:bg-indigo-950/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                    3
                  </span>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Scan in Scanner & See High-Risk Flag
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Switch to the Scanner tab to verify the approval is detected and flagged as High Risk.
                </p>
              </div>

              <button
                onClick={handleInspectInScanner}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-2"
              >
                <span>Switch to Scanner</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* STEP 4 */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              activeStep === 4
                ? 'border-indigo-500/50 bg-indigo-50/30 dark:bg-indigo-950/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center">
                    4
                  </span>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Simulate Spender Pull (Vulnerability Demo)
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Spender calls <code className="font-mono">transferFrom(you, spender, 200)</code>.
                  Demonstrates how approved contracts can withdraw tokens without further permission.
                </p>
              </div>

              <button
                onClick={handleSimulatePull}
                disabled={actionLoading === 'pull' || !isConfigured}
                className="px-4 py-2 bg-purple-600 hover:bg-purple-500 active:bg-purple-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-2"
              >
                {actionLoading === 'pull' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <FlaskConical className="w-4 h-4" />
                )}
                <span>Simulate Spender Pull</span>
              </button>
            </div>

            {/* Pull Result Box */}
            {pullSimulationResult && (
              <div
                className={`mt-4 p-4 rounded-xl border text-xs flex items-start gap-2.5 ${
                  pullSimulationResult.success
                    ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-300 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                    : 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-300 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'
                }`}
              >
                {pullSimulationResult.success ? (
                  <XCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                ) : (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <p className="font-medium">{pullSimulationResult.message}</p>
                  {pullSimulationResult.txHash && (
                    <a
                      href={`${sepoliaConfig.explorerUrl}/tx/${pullSimulationResult.txHash}`}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 font-mono underline hover:opacity-80"
                    >
                      View on Sepolia Etherscan <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* STEP 5 */}
          <div
            className={`p-5 rounded-2xl border transition-all ${
              activeStep === 5
                ? 'border-indigo-500/50 bg-indigo-50/30 dark:bg-indigo-950/20'
                : 'border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/30'
            }`}
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-emerald-600 text-white font-bold text-xs flex items-center justify-center">
                    5
                  </span>
                  <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Revoke Approval & Re-test
                  </h4>
                </div>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Zeros the allowance. After revoking, click &quot;Simulate Spender Pull&quot; in Step 4 again
                  to verify that the transaction reverts!
                </p>
              </div>

              <button
                onClick={handleRevoke}
                disabled={actionLoading === 'revoke' || !isConfigured}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 disabled:opacity-50 text-white font-semibold text-xs rounded-xl shadow-md transition flex items-center gap-2"
              >
                {actionLoading === 'revoke' ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <ShieldCheck className="w-4 h-4" />
                )}
                <span>Revoke Approval (Set to 0)</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
