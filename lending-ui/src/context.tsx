// pUSD Lending Protocol — Global State Context
// Manages wallet, contract, and protocol state across all pages.

import React, { createContext, useContext, useReducer, useCallback } from 'react';
import { api, type WalletInfo, type ProtocolState, type UserPosition, type HealthStatus } from './api.ts';

// ─── State ───────────────────────────────────────────────────────────────────

interface AppState {
    // Connection
    health: HealthStatus | null;
    isConnecting: boolean;

    // Wallet
    wallet: WalletInfo | null;
    walletLoading: boolean;
    walletError: string | null;

    // Contract
    contractAddress: string | null;
    contractLoading: boolean;
    contractError: string | null;

    // Protocol (public)
    protocol: ProtocolState | null;
    protocolLoading: boolean;

    // Position (private)
    position: UserPosition | null;
    positionLoading: boolean;

    // Actions
    actionLoading: boolean;
    actionError: string | null;
    lastTxHash: string | null;
}

const initialState: AppState = {
    health: null,
    isConnecting: false,
    wallet: null,
    walletLoading: false,
    walletError: null,
    contractAddress: null,
    contractLoading: false,
    contractError: null,
    protocol: null,
    protocolLoading: false,
    position: null,
    positionLoading: false,
    actionLoading: false,
    actionError: null,
    lastTxHash: null,
};

// ─── Actions ─────────────────────────────────────────────────────────────────

type Action =
    | { type: 'SET_HEALTH'; payload: HealthStatus }
    | { type: 'SET_CONNECTING'; payload: boolean }
    | { type: 'SET_WALLET'; payload: WalletInfo }
    | { type: 'SET_WALLET_LOADING'; payload: boolean }
    | { type: 'SET_WALLET_ERROR'; payload: string | null }
    | { type: 'SET_CONTRACT_ADDRESS'; payload: string }
    | { type: 'SET_CONTRACT_LOADING'; payload: boolean }
    | { type: 'SET_CONTRACT_ERROR'; payload: string | null }
    | { type: 'SET_PROTOCOL'; payload: ProtocolState | null }
    | { type: 'SET_PROTOCOL_LOADING'; payload: boolean }
    | { type: 'SET_POSITION'; payload: UserPosition | null }
    | { type: 'SET_POSITION_LOADING'; payload: boolean }
    | { type: 'SET_ACTION_LOADING'; payload: boolean }
    | { type: 'SET_ACTION_ERROR'; payload: string | null }
    | { type: 'SET_LAST_TX'; payload: string | null };

function reducer(state: AppState, action: Action): AppState {
    switch (action.type) {
        case 'SET_HEALTH': return { ...state, health: action.payload };
        case 'SET_CONNECTING': return { ...state, isConnecting: action.payload };
        case 'SET_WALLET': return { ...state, wallet: action.payload, walletError: null };
        case 'SET_WALLET_LOADING': return { ...state, walletLoading: action.payload };
        case 'SET_WALLET_ERROR': return { ...state, walletError: action.payload, walletLoading: false };
        case 'SET_CONTRACT_ADDRESS': return { ...state, contractAddress: action.payload, contractError: null };
        case 'SET_CONTRACT_LOADING': return { ...state, contractLoading: action.payload };
        case 'SET_CONTRACT_ERROR': return { ...state, contractError: action.payload, contractLoading: false };
        case 'SET_PROTOCOL': return { ...state, protocol: action.payload };
        case 'SET_PROTOCOL_LOADING': return { ...state, protocolLoading: action.payload };
        case 'SET_POSITION': return { ...state, position: action.payload };
        case 'SET_POSITION_LOADING': return { ...state, positionLoading: action.payload };
        case 'SET_ACTION_LOADING': return { ...state, actionLoading: action.payload };
        case 'SET_ACTION_ERROR': return { ...state, actionError: action.payload, actionLoading: false };
        case 'SET_LAST_TX': return { ...state, lastTxHash: action.payload };
        default: return state;
    }
}

// ─── Context ─────────────────────────────────────────────────────────────────

interface AppContextType {
    state: AppState;
    actions: {
        checkHealth: () => Promise<void>;
        initializeWallet: (seed?: string) => Promise<void>;
        deployContract: () => Promise<void>;
        joinContract: (address: string) => Promise<void>;
        refreshProtocol: () => Promise<void>;
        refreshPosition: () => Promise<void>;
        deposit: (amount: string) => Promise<void>;
        mint: (amount: string) => Promise<void>;
        repay: (amount: string) => Promise<void>;
        withdraw: (amount: string) => Promise<void>;
        liquidate: (collateral: string, debt: string) => Promise<void>;
        clearActionError: () => void;
    };
}

const AppContext = createContext<AppContextType | null>(null);

export const useApp = () => {
    const ctx = useContext(AppContext);
    if (!ctx) throw new Error('useApp must be used within AppProvider');
    return ctx;
};

// ─── Provider ────────────────────────────────────────────────────────────────

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [state, dispatch] = useReducer(reducer, initialState);

    const checkHealth = useCallback(async () => {
        try {
            const health = await api.health();
            dispatch({ type: 'SET_HEALTH', payload: health });
        } catch {
            dispatch({ type: 'SET_HEALTH', payload: null as any });
        }
    }, []);

    const initializeWallet = useCallback(async (seed?: string) => {
        dispatch({ type: 'SET_WALLET_LOADING', payload: true });
        try {
            const info = await api.initializeWallet(seed);
            dispatch({ type: 'SET_WALLET', payload: info });
            dispatch({ type: 'SET_WALLET_LOADING', payload: false });
        } catch (err: any) {
            dispatch({ type: 'SET_WALLET_ERROR', payload: err.message });
        }
    }, []);

    const deployContract = useCallback(async () => {
        dispatch({ type: 'SET_CONTRACT_LOADING', payload: true });
        try {
            const { contractAddress } = await api.deployContract();
            dispatch({ type: 'SET_CONTRACT_ADDRESS', payload: contractAddress });
            dispatch({ type: 'SET_CONTRACT_LOADING', payload: false });
        } catch (err: any) {
            dispatch({ type: 'SET_CONTRACT_ERROR', payload: err.message });
        }
    }, []);

    const joinContract = useCallback(async (address: string) => {
        dispatch({ type: 'SET_CONTRACT_LOADING', payload: true });
        try {
            const { contractAddress } = await api.joinContract(address);
            dispatch({ type: 'SET_CONTRACT_ADDRESS', payload: contractAddress });
            dispatch({ type: 'SET_CONTRACT_LOADING', payload: false });
        } catch (err: any) {
            dispatch({ type: 'SET_CONTRACT_ERROR', payload: err.message });
        }
    }, []);

    const refreshProtocol = useCallback(async () => {
        dispatch({ type: 'SET_PROTOCOL_LOADING', payload: true });
        try {
            const protocol = await api.getProtocolState();
            dispatch({ type: 'SET_PROTOCOL', payload: protocol });
        } catch {
            // Ignore — may not have contract yet
        }
        dispatch({ type: 'SET_PROTOCOL_LOADING', payload: false });
    }, []);

    const refreshPosition = useCallback(async () => {
        dispatch({ type: 'SET_POSITION_LOADING', payload: true });
        try {
            const position = await api.getMyPosition();
            dispatch({ type: 'SET_POSITION', payload: position });
        } catch {
            // Ignore
        }
        dispatch({ type: 'SET_POSITION_LOADING', payload: false });
    }, []);

    const performAction = useCallback(async (fn: () => Promise<any>) => {
        dispatch({ type: 'SET_ACTION_LOADING', payload: true });
        dispatch({ type: 'SET_ACTION_ERROR', payload: null });
        dispatch({ type: 'SET_LAST_TX', payload: null });
        try {
            const result = await fn();
            dispatch({ type: 'SET_LAST_TX', payload: result.txHash });
            dispatch({ type: 'SET_ACTION_LOADING', payload: false });
            // Refresh state after action
            await Promise.all([refreshProtocol(), refreshPosition()]);
        } catch (err: any) {
            dispatch({ type: 'SET_ACTION_ERROR', payload: err.message });
        }
    }, [refreshProtocol, refreshPosition]);

    const actions = {
        checkHealth,
        initializeWallet,
        deployContract,
        joinContract,
        refreshProtocol,
        refreshPosition,
        deposit: (amount: string) => performAction(() => api.deposit(amount)),
        mint: (amount: string) => performAction(() => api.mint(amount)),
        repay: (amount: string) => performAction(() => api.repay(amount)),
        withdraw: (amount: string) => performAction(() => api.withdraw(amount)),
        liquidate: (collateral: string, debt: string) =>
            performAction(() => api.liquidate(collateral, debt)),
        clearActionError: () => dispatch({ type: 'SET_ACTION_ERROR', payload: null }),
    };

    return (
        <AppContext.Provider value={{ state, actions }}>
            {children}
        </AppContext.Provider>
    );
};
