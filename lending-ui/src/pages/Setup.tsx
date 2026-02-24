// pUSD Lending Protocol — Setup Page
// Wallet initialization and contract deployment.

import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useApp } from '../context.tsx';

// ─── Inline Styles ────────────────────────────────────────────────────────────

const styles = {
    page: {
        maxWidth: '800px',
        margin: '0 auto',
    } as React.CSSProperties,

    header: {
        textAlign: 'center' as const,
        marginBottom: '56px',
        position: 'relative' as const,
    },

    headerEyebrow: {
        display: 'inline-flex',
        alignItems: 'center',
        gap: '8px',
        padding: '5px 14px',
        borderRadius: '20px',
        background: 'rgba(200, 214, 232, 0.06)',
        border: '1px solid rgba(200, 214, 232, 0.1)',
        color: 'var(--moon-silver)',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase' as const,
        marginBottom: '20px',
    },

    moonDot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: 'var(--moon-silver)',
        boxShadow: '0 0 6px var(--moon-silver)',
    },

    headerTitle: {
        fontSize: '38px',
        marginBottom: '14px',
        background: 'linear-gradient(120deg, #E6EAF2 0%, var(--moon-silver) 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
        backgroundClip: 'text',
    },

    headerSubtitle: {
        color: 'var(--text-secondary)',
        fontSize: '17px',
        lineHeight: 1.6,
    },

    grid: {
        display: 'grid',
        gap: '24px',
    },

    stepIcon: (active: boolean, done: boolean): React.CSSProperties => ({
        width: '42px',
        height: '42px',
        borderRadius: '50%',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 700,
        fontSize: '16px',
        background: done
            ? 'rgba(76, 175, 80, 0.15)'
            : active
                ? 'rgba(108, 99, 255, 0.15)'
                : 'rgba(255,255,255,0.04)',
        border: done
            ? '1px solid rgba(76, 175, 80, 0.3)'
            : active
                ? '1px solid rgba(108, 99, 255, 0.4)'
                : '1px solid rgba(255,255,255,0.08)',
        color: done
            ? 'var(--status-success)'
            : active
                ? 'var(--accent-primary)'
                : 'var(--text-muted)',
        boxShadow: done
            ? '0 0 16px rgba(76,175,80,0.12)'
            : active
                ? '0 0 16px rgba(108,99,255,0.2)'
                : 'none',
    }),

    stepCard: (active: boolean, done: boolean, disabled: boolean): React.CSSProperties => ({
        opacity: disabled ? 0.45 : 1,
        border: done
            ? '1px solid rgba(76, 175, 80, 0.2)'
            : active
                ? '1px solid rgba(108, 99, 255, 0.35)'
                : '1px solid var(--border-color)',
        transition: 'opacity 0.4s ease, border-color 0.3s ease',
        position: 'relative',
        overflow: 'hidden',
    }),

    stepCardGlow: (active: boolean): React.CSSProperties => ({
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        height: '1px',
        background: active
            ? 'linear-gradient(90deg, transparent, rgba(108, 99, 255, 0.5), transparent)'
            : 'linear-gradient(90deg, transparent, rgba(200, 214, 232, 0.12), transparent)',
        pointerEvents: 'none',
    }),

    stepHeader: {
        display: 'flex',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '24px',
    },

    stepTitle: {
        fontSize: '19px',
        flex: 1,
    },

    infoPanel: {
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: '14px',
        padding: '20px',
    },

    previewRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '10px 0',
        borderBottom: '1px solid rgba(255,255,255,0.05)',
    },

    previewLabel: {
        fontSize: '10px',
        fontWeight: 700,
        letterSpacing: '0.1em',
        color: 'var(--text-muted)',
        textTransform: 'uppercase' as const,
    },

    previewValue: {
        fontSize: '13px',
        color: 'var(--text-primary)',
        fontFamily: 'monospace',
    },

    warningBox: {
        marginTop: '16px',
        padding: '14px',
        background: 'rgba(255, 184, 77, 0.07)',
        borderRadius: '10px',
        border: '1px solid rgba(255, 184, 77, 0.18)',
    },

    errorBox: {
        padding: '14px',
        borderRadius: '10px',
        marginBottom: '20px',
        background: 'rgba(255, 92, 92, 0.08)',
        border: '1px solid rgba(255, 92, 92, 0.2)',
        color: 'var(--status-error)',
        fontSize: '14px',
    },

    contractOptions: {
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: '16px',
        marginBottom: '24px',
    },

    contractOption: {
        textAlign: 'center' as const,
        padding: '24px',
        background: 'rgba(255,255,255,0.02)',
        border: '1px solid rgba(255,255,255,0.05)',
        borderRadius: '14px',
        transition: 'border-color 0.2s ease',
    },

    syncNote: {
        marginTop: '16px',
        fontSize: '12px',
        color: 'var(--text-muted)',
        textAlign: 'center' as const,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '8px',
    },

    successCard: {
        textAlign: 'center' as const,
        padding: '56px 48px',
        background: 'linear-gradient(135deg, rgba(108, 99, 255, 0.08) 0%, rgba(0, 229, 255, 0.04) 100%)',
        border: '1px solid rgba(108, 99, 255, 0.2)',
        position: 'relative' as const,
        overflow: 'hidden' as const,
    },

    successGlow: {
        position: 'absolute' as const,
        top: '-60px',
        left: '50%',
        transform: 'translateX(-50%)',
        width: '300px',
        height: '200px',
        background: 'radial-gradient(ellipse, rgba(108, 99, 255, 0.12) 0%, transparent 70%)',
        pointerEvents: 'none' as const,
    },
};

// ─── Moon Crescent Icon ───────────────────────────────────────────────────────

const MoonIcon: React.FC<{ size?: number }> = ({ size = 48 }) => (
    <div
        style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'transparent',
            boxShadow: `inset -${size * 0.22}px ${size * 0.06}px 0 0 var(--moon-silver), 0 0 ${size * 0.5}px rgba(200,214,232,0.2), 0 0 ${size}px rgba(108,99,255,0.1)`,
            border: '1px solid rgba(200, 214, 232, 0.15)',
            flexShrink: 0,
        }}
    />
);

// ─── Step Connector ───────────────────────────────────────────────────────────

const StepConnector: React.FC<{ done: boolean }> = ({ done }) => (
    <div style={{ display: 'flex', justifyContent: 'center', margin: '-8px 0' }}>
        <div
            style={{
                width: '1px',
                height: '24px',
                background: done
                    ? 'linear-gradient(180deg, rgba(76,175,80,0.4), rgba(76,175,80,0.1))'
                    : 'linear-gradient(180deg, rgba(108,99,255,0.3), transparent)',
            }}
        />
    </div>
);

// ─── Component ────────────────────────────────────────────────────────────────

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

    React.useEffect(() => {
        if (state.wallet && state.contractAddress && !state.contractLoading && state.health?.ready) {
            actions.refreshProtocol();
            actions.refreshPosition();
        }
    }, [state.wallet, state.contractAddress, state.contractLoading, state.health?.ready]);

    const hasWallet = !!state.wallet;
    const hasContract = !!state.contractAddress;

    return (
        <div className="animate-fade-in" style={styles.page}>

            {/* ── Header ── */}
            <header style={styles.header}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '24px' }}>
                    <MoonIcon size={52} />
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '16px' }}>
                    <div style={styles.headerEyebrow}>
                        <span style={styles.moonDot} />
                        Midnight Network
                    </div>
                </div>
                <h1 style={styles.headerTitle}>Protocol Onboarding</h1>
                <p style={styles.headerSubtitle}>
                    Connect your wallet and initialize the protocol to begin private lending.
                </p>
            </header>

            <div style={styles.grid}>

                {/* ── Step 1: Wallet ── */}
                <div className="card" style={styles.stepCard(true, hasWallet, false)}>
                    <div style={styles.stepCardGlow(!hasWallet)} />

                    <div style={styles.stepHeader}>
                        <div style={styles.stepIcon(!hasWallet, hasWallet)}>
                            {hasWallet ? '✓' : '1'}
                        </div>
                        <h2 style={styles.stepTitle}>Initialize Midnight Wallet</h2>
                        {hasWallet && (
                            <span className="health-status status-green">Wallet Ready</span>
                        )}
                    </div>

                    {!hasWallet ? (
                        <>
                            <div className="form-group">
                                <label
                                    className="form-label"
                                    style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                                >
                                    <input
                                        type="checkbox"
                                        checked={useExistingSeed}
                                        onChange={(e) => setUseExistingSeed(e.target.checked)}
                                        style={{ accentColor: 'var(--accent-primary)', width: '16px', height: '16px' }}
                                    />
                                    Restore from existing seed phrase
                                </label>
                            </div>

                            {useExistingSeed && (
                                <div className="form-group">
                                    <label className="form-label">Seed Phrase (64-char Hex)</label>
                                    <input
                                        className="form-input"
                                        type="password"
                                        value={seedInput}
                                        onChange={(e) => setSeedInput(e.target.value)}
                                        placeholder="Enter your private hex seed..."
                                    />
                                </div>
                            )}

                            {state.walletError && (
                                <div style={styles.errorBox}>⚠ {state.walletError}</div>
                            )}

                            <button
                                className="btn btn-primary"
                                style={{ width: '100%' }}
                                onClick={handleInitWallet}
                                disabled={state.walletLoading}
                            >
                                {state.walletLoading
                                    ? <><div className="loading-orbit" style={{ width: '18px', height: '18px' }} /> Initializing…</>
                                    : 'Initialize Wallet'}
                            </button>

                            {state.walletLoading && (
                                <p style={styles.syncNote}>
                                    <span>🌑</span>
                                    Syncing with the Midnight network — this usually takes ~30s
                                </p>
                            )}
                        </>
                    ) : (
                        <div style={styles.infoPanel}>
                            <div style={styles.previewRow}>
                                <span style={styles.previewLabel}>Unshielded Address</span>
                                <span style={styles.previewValue}>
                                    {state.wallet!.unshieldedAddress.slice(0, 22)}…
                                </span>
                            </div>
                            <div style={{ ...styles.previewRow, borderBottom: 'none' }}>
                                <span style={styles.previewLabel}>Current Balance</span>
                                <span style={styles.previewValue}>
                                    {formatBalance(state.wallet!.unshieldedBalance)} tN
                                </span>
                            </div>
                            <div style={styles.warningBox}>
                                <p style={{ fontSize: '11px', color: 'var(--status-warning)', fontWeight: 700, letterSpacing: '0.06em' }}>
                                    PRIVATE KEY DETECTED
                                </p>
                                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '6px', lineHeight: 1.5 }}>
                                    Your seed is stored in session memory and will be used for proof generation.
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                <StepConnector done={hasWallet} />

                {/* ── Step 2: Contract ── */}
                <div
                    className="card"
                    style={styles.stepCard(hasWallet && !hasContract, hasContract, !hasWallet)}
                >
                    <div style={styles.stepCardGlow(hasWallet && !hasContract)} />

                    <div style={styles.stepHeader}>
                        <div style={styles.stepIcon(hasWallet && !hasContract, hasContract)}>
                            {hasContract ? '✓' : '2'}
                        </div>
                        <h2 style={styles.stepTitle}>Lending Contract</h2>
                        {hasContract && (
                            <span className="health-status status-green">Active</span>
                        )}
                    </div>

                    {hasWallet && !hasContract && (
                        <>
                            <div style={styles.contractOptions}>
                                <div style={styles.contractOption}>
                                    <p style={{ fontSize: '13px', marginBottom: '16px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                        Launch a new instance of the protocol on Midnight.
                                    </p>
                                    <button
                                        className="btn btn-primary"
                                        onClick={handleDeploy}
                                        disabled={state.contractLoading}
                                    >
                                        {state.contractLoading ? (
                                            <><div className="loading-orbit" style={{ width: '16px', height: '16px' }} /> Deploying…</>
                                        ) : 'Deploy New'}
                                    </button>
                                </div>
                                <div style={styles.contractOption}>
                                    <p style={{ fontSize: '13px', marginBottom: '16px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                                        Connect to an existing protocol instance.
                                    </p>
                                    <button
                                        className="btn btn-ghost"
                                        onClick={() => document.getElementById('join-input')?.focus()}
                                    >
                                        Join Existing
                                    </button>
                                </div>
                            </div>

                            <div className="form-group">
                                <label className="form-label">Contract Address</label>
                                <input
                                    id="join-input"
                                    className="form-input"
                                    type="text"
                                    value={contractInput}
                                    onChange={(e) => setContractInput(e.target.value)}
                                    placeholder="midnight1…"
                                />
                            </div>
                            <button
                                className="btn btn-ghost"
                                style={{ width: '100%' }}
                                onClick={handleJoin}
                                disabled={state.contractLoading || !contractInput}
                            >
                                Confirm Join
                            </button>
                        </>
                    )}

                    {hasContract && (
                        <div style={styles.infoPanel}>
                            <div style={{ ...styles.previewRow, borderBottom: 'none' }}>
                                <span style={styles.previewLabel}>Active Contract</span>
                                <span style={styles.previewValue}>{state.contractAddress}</span>
                            </div>
                        </div>
                    )}
                </div>

                {/* ── Step 3: Success ── */}
                {hasWallet && hasContract && (
                    <>
                        <StepConnector done />
                        <div className="card animate-fade-in" style={styles.successCard}>
                            <div style={styles.successGlow} />

                            {/* Crescent moon + stars composition */}
                            <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', marginBottom: '24px' }}>
                                <MoonIcon size={56} />
                                <span style={{ position: 'absolute', top: '-8px', right: '-14px', fontSize: '14px', opacity: 0.7 }}>✦</span>
                                <span style={{ position: 'absolute', bottom: '-4px', left: '-18px', fontSize: '10px', opacity: 0.5 }}>✦</span>
                            </div>

                            <h2 style={{ fontSize: '26px', marginBottom: '12px' }}>You're all set</h2>
                            <p style={{ color: 'var(--text-secondary)', marginBottom: '36px', lineHeight: 1.6 }}>
                                The protocol is initialized and ready. You can now deposit collateral and mint pUSD.
                            </p>
                            <button
                                className="btn btn-primary"
                                style={{ padding: '16px 52px', fontSize: '17px' }}
                                onClick={() => navigate('/dashboard')}
                            >
                                Enter Dashboard →
                            </button>
                        </div>
                    </>
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