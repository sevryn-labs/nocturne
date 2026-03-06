// pUSD Lending Protocol — API Client
// Typed HTTP client for the lending-api REST server.

const API_BASE = '/api';

class ApiError extends Error {
    constructor(
        message: string,
        public readonly errorType: string,
        public readonly status: number,
    ) {
        super(message);
        this.name = 'ApiError';
    }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
    const url = `${API_BASE}${path}`;
    const res = await fetch(url, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...options?.headers,
        },
    });

    const text = await res.text();
    let data: any;
    try {
        data = JSON.parse(text);
    } catch {
        throw new ApiError(text || 'Unknown error', 'UNKNOWN', res.status);
    }

    if (!res.ok) {
        throw new ApiError(
            data.error || 'Request failed',
            data.errorType || 'UNKNOWN',
            res.status,
        );
    }

    return data as T;
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface HealthStatus {
    status: string;
    network: string;
    walletInitialized: boolean;
    contractDeployed: boolean;
    contractAddress: string | null;
}

export interface WalletInfo {
    seed: string;
    network: string;
    unshieldedAddress: string;
    shieldedAddress: string;
    dustAddress: string;
    unshieldedBalance: string;
    dustBalance: string;
    isSynced: boolean;
}

export interface ProtocolState {
    totalCollateral: string;
    totalDebt: string;
    liquidationRatio: string;
    mintingRatio: string;
    /** pUSD token total supply — always equals totalDebt */
    totalSupply: string;
}

export interface UserPosition {
    collateralAmount: string;
    debtAmount: string;
    collateralRatio: string;
    isLiquidatable: boolean;
}

export interface TxResult {
    txHash: string;
    blockHeight: string;
}

export interface DustBalance {
    available: string;
    pending: string;
}

// ─── API Functions ───────────────────────────────────────────────────────────

export const api = {
    // Health
    health: () => request<HealthStatus>('/health'),

    // Wallet
    initializeWallet: (seed?: string) =>
        request<WalletInfo>('/wallet/initialize', {
            method: 'POST',
            body: JSON.stringify(seed ? { seed } : {}),
        }),

    getWalletInfo: () => request<WalletInfo>('/wallet/info'),

    waitForFunds: () =>
        request<{ balance: string }>('/wallet/wait-for-funds', { method: 'POST' }),

    registerDust: () =>
        request<{ success: boolean }>('/wallet/register-dust', { method: 'POST' }),

    getDustBalance: () => request<DustBalance>('/wallet/dust'),

    // Contract
    deployContract: () =>
        request<{ contractAddress: string }>('/contract/deploy', { method: 'POST' }),

    joinContract: (address: string) =>
        request<{ contractAddress: string }>('/contract/join', {
            method: 'POST',
            body: JSON.stringify({ address }),
        }),

    // State
    getProtocolState: () => request<ProtocolState>('/protocol/state'),
    getMyPosition: () => request<UserPosition>('/position'),

    // Actions
    deposit: (amount: string) =>
        request<TxResult>('/actions/deposit', {
            method: 'POST',
            body: JSON.stringify({ amount }),
        }),

    mint: (amount: string) =>
        request<TxResult>('/actions/mint', {
            method: 'POST',
            body: JSON.stringify({ amount }),
        }),

    repay: (amount: string) =>
        request<TxResult>('/actions/repay', {
            method: 'POST',
            body: JSON.stringify({ amount }),
        }),

    withdraw: (amount: string) =>
        request<TxResult>('/actions/withdraw', {
            method: 'POST',
            body: JSON.stringify({ amount }),
        }),

    liquidate: (victimCollateral: string, victimDebt: string) =>
        request<TxResult>('/actions/liquidate', {
            method: 'POST',
            body: JSON.stringify({ victimCollateral, victimDebt }),
        }),

    // pUSD Token
    getPUSDBalance: (publicKey?: string) =>
        request<{ balance: string }>(`/token/balance${publicKey ? `?publicKey=${encodeURIComponent(publicKey)}` : ''}`),

    transferPUSD: (to: string, amount: string) =>
        request<TxResult>('/token/transfer', {
            method: 'POST',
            body: JSON.stringify({ to, amount }),
        }),

    approvePUSD: (spender: string, amount: string) =>
        request<TxResult>('/token/approve', {
            method: 'POST',
            body: JSON.stringify({ spender, amount }),
        }),

    transferPUSDFrom: (from: string, to: string, amount: string) =>
        request<TxResult>('/token/transfer-from', {
            method: 'POST',
            body: JSON.stringify({ from, to, amount }),
        }),
};

export { ApiError };