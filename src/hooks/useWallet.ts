/**
 * src/hooks/useWallet.ts
 *
 * Single shared React hook for MetaMask connection state.
 * Keep ONE instance at the top (App.tsx) and pass values down as props.
 *
 * What it manages:
 *  - address, chainId, signer, provider — current connected wallet state
 *  - error, connecting — UI feedback state
 *  - connect(), switchChain(), disconnect() — actions
 *  - Listens to accountsChanged and chainChanged events so the UI stays in sync
 *    when the user switches accounts or networks in MetaMask without reloading.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { BrowserProvider } from 'ethers';
import type { JsonRpcSigner } from 'ethers';
import { connectMetaMask, switchToChain, friendlyWalletError } from '../lib/wallet';

export interface WalletState {
  address: string | null;
  chainId: number | null;
  signer: JsonRpcSigner | null;
  provider: BrowserProvider | null;
  error: string | null;
  connecting: boolean;
}

export interface UseWalletReturn extends WalletState {
  connect: () => Promise<void>;
  switchChain: (chainId: number) => Promise<void>;
  disconnect: () => void;
}

export function useWallet(): UseWalletReturn {
  const [state, setState] = useState<WalletState>({
    address: null,
    chainId: null,
    signer: null,
    provider: null,
    error: null,
    connecting: false,
  });

  // Track the raw injected provider in state so listener lifecycle is strictly tied to it
  const [injectedProvider, setInjectedProvider] = useState<any>(null);
  const injectedRef = useRef<any>(null);

  // ── Listener management ──────────────────────────────────────────────────

  /**
   * Refreshes all wallet state by re-querying the injected provider.
   * Called when accountsChanged or chainChanged fires.
   */
  const refreshState = useCallback(async (injected: any) => {
    try {
      const accounts: string[] = await injected.request({ method: 'eth_accounts' });
      if (!accounts || accounts.length === 0) {
        // User disconnected all accounts in MetaMask
        setState({
          address: null, chainId: null, signer: null, provider: null,
          error: null, connecting: false,
        });
        setInjectedProvider(null);
        injectedRef.current = null;
        return;
      }

      const provider = new BrowserProvider(injected);
      const signer = await provider.getSigner();
      const network = await provider.getNetwork();

      setState({
        address: accounts[0],
        chainId: Number(network.chainId),
        signer,
        provider,
        error: null,
        connecting: false,
      });
    } catch (err: any) {
      console.warn('useWallet: refreshState failed', err);
    }
  }, []);

  // Attach listeners cleanly once per connected injectedProvider
  useEffect(() => {
    if (!injectedProvider) return;

    let mounted = true;

    const onAccountsChanged = (accounts: string[]) => {
      if (!mounted) return;
      if (!accounts || accounts.length === 0) {
        setState({
          address: null, chainId: null, signer: null, provider: null,
          error: null, connecting: false,
        });
        setInjectedProvider(null);
        injectedRef.current = null;
      } else {
        refreshState(injectedProvider);
      }
    };

    const onChainChanged = () => {
      if (!mounted) return;
      refreshState(injectedProvider);
    };

    injectedProvider.on?.('accountsChanged', onAccountsChanged);
    injectedProvider.on?.('chainChanged', onChainChanged);

    return () => {
      mounted = false;
      injectedProvider.removeListener?.('accountsChanged', onAccountsChanged);
      injectedProvider.removeListener?.('chainChanged', onChainChanged);
    };
  }, [injectedProvider, refreshState]);

  // ── Actions ──────────────────────────────────────────────────────────────

  /** Connect to MetaMask. Must be called from a button click handler. */
  const connect = useCallback(async () => {
    setState((s) => ({ ...s, connecting: true, error: null }));
    try {
      const result = await connectMetaMask();
      injectedRef.current = result.injected;
      setInjectedProvider(result.injected);

      setState({
        address: result.address,
        chainId: result.chainId,
        signer: result.signer,
        provider: result.provider,
        error: null,
        connecting: false,
      });
    } catch (err: any) {
      const message = friendlyWalletError(err);
      setState((s) => ({ ...s, connecting: false, error: message }));
    }
  }, []);

  /** Switch the connected wallet to a different chain. */
  const switchChain = useCallback(async (chainId: number) => {
    const injected = injectedRef.current || injectedProvider;
    if (!injected) {
      setState((s) => ({ ...s, error: 'Connect MetaMask first before switching chains.' }));
      return;
    }
    try {
      await switchToChain(injected, chainId);
      // Listeners will fire chainChanged and auto-refresh state
    } catch (err: any) {
      const message = friendlyWalletError(err);
      setState((s) => ({ ...s, error: message }));
    }
  }, [injectedProvider]);

  /** Disconnect — clears app state only. Does NOT ask MetaMask to disconnect. */
  const disconnect = useCallback(() => {
    injectedRef.current = null;
    setInjectedProvider(null);
    setState({
      address: null, chainId: null, signer: null, provider: null,
      error: null, connecting: false,
    });
  }, []);

  return { ...state, connect, switchChain, disconnect };
}
