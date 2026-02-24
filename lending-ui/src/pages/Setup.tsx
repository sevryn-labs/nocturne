// pUSD Lending Protocol — Setup Page
// Wallet initialization, funding, dust registration, and contract deploy/join.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context.tsx';

export const Setup: React.FC = () => {
    const { state, actions } = useApp();
    const navigate = useNavigate();
    const [seedInput, setSeedInput] = useState('');
    const [contractInput, setContractInput] = useState('');
    const [useExistingSeed, setUseExistingSeed] = useState(false);

    const handleInitWallet = async () => {
        await actions.initializeWallet(useExistingSeed && seedInput ? seedInput : undefined);
    };

    const handleDeploy = async () => {
        await actions.deployContract();
    };

    const handleJoin = async () => {
        if (contractInput.trim()) {
            await actions.joinContract(contractInput.trim());
        }
    };

    // Navigate to dashboard when both wallet and contract are ready
    React.useEffect(() => {
        if (state.wallet && state.contractAddress && !state.contractLoading) {
            actions.refreshProtocol();
            actions.refreshPosition();
        }
    }, [state.wallet, state.contractAddress, state.contractLoading]);

    const hasWallet = !!state.wallet;
    const hasContract = !!state.contractAddress;

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1 className="page-title">Protocol Setup</h1>
                <p className="page-subtitle">
                    Connect your wallet and deploy or join a lending contract to get started.
                </p>
            </div>

            <div className="setup-steps">
                {/* Step 1: Wallet */}
                <div className={`card ${hasWallet ? '' : 'card-highlight'} animate-in`}>
                    <div className="card-header">
                        <div className="card-title">
                            <span className={`step-number ${hasWallet ? 'step-done' : 'step-active'}`}>
                                {hasWallet ? '✓' : '1'}
                            </span>
                            Initialize Wallet
                        </div>
                        {hasWallet && (
                            <span className="health-badge healthy">Connected</span>
                        )}
                    </div>

                    {!hasWallet ? (
                        <>
                            <div style={{ marginBottom: '1rem' }}>
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                                    <input
                                        type="checkbox"
                                        checked={useExistingSeed}
                                        onChange={(e) => setUseExistingSeed(e.target.checked)}
                                        style={{ accentColor: 'var(--accent-primary)' }}
                                    />
                                    Restore from existing seed
                                </label>
                            </div>

                            {useExistingSeed && (
                                <div className="form-group">
                                    <label className="form-label">Wallet Seed (hex)</label>
                                    <input
                                        id="seed-input"
                                        className="form-input"
                                        type="text"
                                        value={seedInput}
                                        onChange={(e) => setSeedInput(e.target.value)}
                                        placeholder="Enter your 64-character hex seed..."
                                        disabled={state.walletLoading}
                                    />
                                </div>
                            )}

                            {state.walletError && (
                                <div className="alert alert-error">⚠ {state.walletError}</div>
                            )}

                            <button
                                id="btn-init-wallet"
                                className="btn btn-primary btn-full"
                                onClick={handleInitWallet}
                                disabled={state.walletLoading}
                            >
                                {state.walletLoading ? (
                                    <>
                                        <span className="spinner" />
                                        Initializing wallet & syncing...
                                    </>
                                ) : useExistingSeed ? 'Restore Wallet' : 'Create New Wallet'}
                            </button>

                            {state.walletLoading && (
                                <div className="alert alert-info" style={{ marginTop: '0.75rem' }}>
                                    ⏳ This may take 30–60 seconds — building wallet, syncing with network, and registering for DUST generation.
                                </div>
                            )}
                        </>
                    ) : (
                        <div>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <div className="form-label">Seed</div>
                                <div className="seed-display">{state.wallet!.seed}</div>
                            </div>
                            <div style={{ marginBottom: '0.75rem' }}>
                                <div className="form-label">Unshielded Address</div>
                                <div className="address-display">{state.wallet!.unshieldedAddress}</div>
                            </div>
                            <div className="preview-row">
                                <span className="preview-label">Balance</span>
                                <span className="preview-value">{formatBalance(state.wallet!.unshieldedBalance)} tNight</span>
                            </div>
                            <div className="preview-row">
                                <span className="preview-label">Network</span>
                                <span className="preview-value">{state.wallet!.network}</span>
                            </div>

                            <div className="alert alert-warning" style={{ marginTop: '0.75rem' }}>
                                ⚠ Save your seed! It's the only way to restore your wallet and private position data.
                            </div>
                        </div>
                    )}
                </div>

                {/* Step 2: Contract */}
                <div className={`card ${hasWallet && !hasContract ? 'card-highlight' : ''} animate-in`}>
                    <div className="card-header">
                        <div className="card-title">
                            <span className={`step-number ${hasContract ? 'step-done' : hasWallet ? 'step-active' : 'step-pending'}`}>
                                {hasContract ? '✓' : '2'}
                            </span>
                            Deploy or Join Contract
                        </div>
                        {hasContract && (
                            <span className="health-badge healthy">Active</span>
                        )}
                    </div>

                    {!hasWallet && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            Initialize your wallet first.
                        </p>
                    )}

                    {hasWallet && !hasContract && (
                        <>
                            {state.contractError && (
                                <div className="alert alert-error">⚠ {state.contractError}</div>
                            )}

                            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1.25rem' }}>
                                <button
                                    id="btn-deploy"
                                    className="btn btn-primary"
                                    onClick={handleDeploy}
                                    disabled={state.contractLoading}
                                    style={{ flex: 1 }}
                                >
                                    {state.contractLoading ? (
                                        <><span className="spinner" /> Deploying...</>
                                    ) : '🚀 Deploy New Contract'}
                                </button>
                            </div>

                            <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '1rem' }}>
                                — or join an existing contract —
                            </div>

                            <div className="form-group">
                                <label className="form-label">Contract Address</label>
                                <input
                                    id="contract-address-input"
                                    className="form-input"
                                    type="text"
                                    value={contractInput}
                                    onChange={(e) => setContractInput(e.target.value)}
                                    placeholder="Paste a contract address..."
                                    disabled={state.contractLoading}
                                />
                            </div>

                            <button
                                id="btn-join"
                                className="btn btn-secondary btn-full"
                                onClick={handleJoin}
                                disabled={state.contractLoading || !contractInput.trim()}
                            >
                                Join Existing Contract
                            </button>

                            {state.contractLoading && (
                                <div className="alert alert-info" style={{ marginTop: '0.75rem' }}>
                                    ⏳ Deploying contract and waiting for ZK proof... This may take 1–3 minutes.
                                </div>
                            )}
                        </>
                    )}

                    {hasContract && (
                        <div>
                            <div className="form-label">Contract Address</div>
                            <div className="address-display">{state.contractAddress}</div>
                        </div>
                    )}
                </div>

                {/* Step 3: Ready */}
                {hasWallet && hasContract && (
                    <div className="card card-highlight animate-in">
                        <div style={{ textAlign: 'center', padding: '1rem' }}>
                            <div style={{ fontSize: '2rem', marginBottom: '0.75rem' }}>🎉</div>
                            <div style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.5rem' }}>
                                Protocol Ready
                            </div>
                            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', marginBottom: '1.25rem' }}>
                                Your wallet is connected and the contract is active. Start lending!
                            </p>
                            <button
                                id="btn-goto-dashboard"
                                className="btn btn-primary"
                                onClick={() => navigate('/dashboard')}
                            >
                                Go to Dashboard →
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

function formatBalance(val: string): string {
    try {
        return BigInt(val).toLocaleString();
    } catch {
        return val;
    }
}
