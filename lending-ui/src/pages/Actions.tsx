// pUSD Lending Protocol — Actions Page
// Forms for all lending operations with live ratio preview.

import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context.tsx';
import { useNavigate } from 'react-router-dom';

type ActionTab = 'deposit' | 'mint' | 'repay' | 'withdraw' | 'liquidate';

export const Actions: React.FC = () => {
    const { state, actions } = useApp();
    const navigate = useNavigate();
    const [tab, setTab] = useState<ActionTab>('deposit');

    // Form state
    const [amount, setAmount] = useState('');
    const [victimCollateral, setVictimCollateral] = useState('');
    const [victimDebt, setVictimDebt] = useState('');

    useEffect(() => {
        if (!state.wallet || !state.contractAddress) {
            navigate('/setup');
            return;
        }
        actions.refreshPosition();
        actions.refreshProtocol();
    }, [state.wallet, state.contractAddress]);

    // Current position
    const collateral = state.position ? BigInt(state.position.collateralAmount) : 0n;
    const debt = state.position ? BigInt(state.position.debtAmount) : 0n;
    const liquidationRatio = state.protocol ? BigInt(state.protocol.liquidationRatio) : 150n;

    // Live ratio preview
    const previewRatio = useMemo(() => {
        const amtBig = parseBigInt(amount);
        if (amtBig <= 0n) return null;

        let newCollateral = collateral;
        let newDebt = debt;

        switch (tab) {
            case 'deposit':
                newCollateral = collateral + amtBig;
                break;
            case 'mint':
                newDebt = debt + amtBig;
                break;
            case 'repay':
                newDebt = debt - amtBig;
                if (newDebt < 0n) newDebt = 0n;
                break;
            case 'withdraw':
                newCollateral = collateral - amtBig;
                if (newCollateral < 0n) newCollateral = 0n;
                break;
            default:
                return null;
        }

        if (newDebt === 0n) return { ratio: Infinity, safe: true };
        const ratio = Number((newCollateral * 100n) / newDebt);
        return { ratio, safe: ratio >= Number(liquidationRatio) };
    }, [amount, tab, collateral, debt, liquidationRatio]);

    const handleSubmit = async () => {
        if (tab === 'liquidate') {
            await actions.liquidate(victimCollateral, victimDebt);
        } else {
            const actionFn = { deposit: actions.deposit, mint: actions.mint, repay: actions.repay, withdraw: actions.withdraw }[tab];
            await actionFn(amount);
        }
        setAmount('');
        setVictimCollateral('');
        setVictimDebt('');
    };

    const canSubmit = tab === 'liquidate'
        ? (parseBigInt(victimCollateral) > 0n && parseBigInt(victimDebt) > 0n)
        : parseBigInt(amount) > 0n;

    const tabs: { key: ActionTab; label: string; icon: string; color: string }[] = [
        { key: 'deposit', label: 'Deposit', icon: '📥', color: 'var(--health-green)' },
        { key: 'mint', label: 'Mint', icon: '🪙', color: 'var(--accent-secondary)' },
        { key: 'repay', label: 'Repay', icon: '💸', color: 'var(--accent-primary)' },
        { key: 'withdraw', label: 'Withdraw', icon: '📤', color: 'var(--health-yellow)' },
        { key: 'liquidate', label: 'Liquidate', icon: '⚡', color: 'var(--health-red)' },
    ];

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1 className="page-title">Lending Actions</h1>
                <p className="page-subtitle">
                    Manage your lending position. All operations generate zero-knowledge proofs locally.
                </p>
            </div>

            {/* Current Position Summary */}
            <div className="stat-grid" style={{ marginBottom: '1.5rem' }}>
                <div className="card stat-card">
                    <div className="stat-label">My Collateral</div>
                    <div className="stat-value">{collateral.toLocaleString()} <span className="stat-suffix">tNight</span></div>
                </div>
                <div className="card stat-card">
                    <div className="stat-label">My Debt</div>
                    <div className="stat-value accent">{debt.toLocaleString()} <span className="stat-suffix">pUSD</span></div>
                </div>
                <div className="card stat-card">
                    <div className="stat-label">Current Ratio</div>
                    <div className="stat-value" style={{ color: debt > 0n ? getRatioColor(Number((collateral * 100n) / debt)) : 'var(--text-muted)' }}>
                        {debt > 0n ? `${Number((collateral * 100n) / debt)}%` : '∞'}
                    </div>
                </div>
            </div>

            {/* Tab Navigation */}
            <div style={{ display: 'flex', gap: '0.25rem', marginBottom: '1.5rem', overflowX: 'auto' }}>
                {tabs.map((t) => (
                    <button
                        key={t.key}
                        id={`tab-${t.key}`}
                        className={`btn ${tab === t.key ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={() => { setTab(t.key); setAmount(''); actions.clearActionError(); }}
                        style={{
                            flex: 1,
                            minWidth: 'fit-content',
                            ...(tab === t.key ? { boxShadow: `0 0 20px ${t.color}33` } : {}),
                        }}
                    >
                        {t.icon} {t.label}
                    </button>
                ))}
            </div>

            {/* Action Form */}
            <div className="card card-highlight animate-in" style={{ maxWidth: '560px' }}>
                <div className="card-header">
                    <div className="card-title">
                        <span className="icon">{tabs.find(t => t.key === tab)?.icon}</span>
                        {tabs.find(t => t.key === tab)?.label}
                    </div>
                </div>

                {/* Error / Success */}
                {state.actionError && (
                    <div className="alert alert-error">⚠ {state.actionError}</div>
                )}
                {state.lastTxHash && (
                    <div className="alert alert-success">
                        ✅ Transaction confirmed!
                        <span className="tx-hash" style={{ marginLeft: '0.5rem' }}>
                            TX: {state.lastTxHash}
                        </span>
                    </div>
                )}

                {tab !== 'liquidate' ? (
                    <>
                        <div className="form-group">
                            <label className="form-label">
                                {tab === 'deposit' ? 'Collateral Amount (tNight)' :
                                    tab === 'mint' ? 'Mint Amount (pUSD)' :
                                        tab === 'repay' ? 'Repay Amount (pUSD)' :
                                            'Withdrawal Amount (tNight)'}
                            </label>
                            <input
                                id={`input-${tab}`}
                                className="form-input"
                                type="text"
                                value={amount}
                                onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="Enter amount..."
                                disabled={state.actionLoading}
                                autoFocus
                            />
                            {tab === 'repay' && debt > 0n && (
                                <div className="form-hint">
                                    Max: {debt.toLocaleString()} pUSD |
                                    <button
                                        style={{ background: 'none', border: 'none', color: 'var(--accent-primary)', cursor: 'pointer', fontSize: '0.75rem', marginLeft: '0.25rem' }}
                                        onClick={() => setAmount(debt.toString())}
                                    >
                                        Repay All
                                    </button>
                                </div>
                            )}
                            {tab === 'withdraw' && collateral > 0n && (
                                <div className="form-hint">
                                    Max safe withdrawal depends on your debt and liquidation ratio.
                                </div>
                            )}
                        </div>

                        {/* Live Preview */}
                        {previewRatio !== null && (
                            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)', border: `1px solid ${previewRatio.safe ? 'var(--border-subtle)' : 'rgba(225, 112, 85, 0.3)'}` }}>
                                <div className="preview-row">
                                    <span className="preview-label">New Collateral Ratio</span>
                                    <span className="preview-value" style={{ color: previewRatio.ratio === Infinity ? 'var(--health-green)' : getRatioColor(previewRatio.ratio) }}>
                                        {previewRatio.ratio === Infinity ? '∞' : `${previewRatio.ratio}%`}
                                    </span>
                                </div>
                                {!previewRatio.safe && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--health-red)', marginTop: '0.25rem' }}>
                                        ⚠ This action would breach the {Number(liquidationRatio)}% liquidation ratio
                                    </div>
                                )}
                                {previewRatio.safe && previewRatio.ratio !== Infinity && previewRatio.ratio < 170 && (
                                    <div style={{ fontSize: '0.75rem', color: 'var(--health-yellow)', marginTop: '0.25rem' }}>
                                        ⚠ Ratio would be below 170% — position would be at risk
                                    </div>
                                )}
                            </div>
                        )}
                    </>
                ) : (
                    <>
                        <div className="form-group">
                            <label className="form-label">Victim's Collateral (tNight)</label>
                            <input
                                id="input-victim-collateral"
                                className="form-input"
                                type="text"
                                value={victimCollateral}
                                onChange={(e) => setVictimCollateral(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="Enter victim's collateral amount..."
                                disabled={state.actionLoading}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Victim's Debt (pUSD)</label>
                            <input
                                id="input-victim-debt"
                                className="form-input"
                                type="text"
                                value={victimDebt}
                                onChange={(e) => setVictimDebt(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="Enter victim's debt amount..."
                                disabled={state.actionLoading}
                            />
                        </div>

                        {/* Liquidation Preview */}
                        {parseBigInt(victimCollateral) > 0n && parseBigInt(victimDebt) > 0n && (
                            <div style={{ marginBottom: '1rem', padding: '0.75rem', background: 'var(--bg-glass)', borderRadius: 'var(--radius-md)' }}>
                                <div className="preview-row">
                                    <span className="preview-label">Victim's Ratio</span>
                                    <span className="preview-value" style={{ color: getRatioColor(Number((parseBigInt(victimCollateral) * 100n) / parseBigInt(victimDebt))) }}>
                                        {Number((parseBigInt(victimCollateral) * 100n) / parseBigInt(victimDebt))}%
                                    </span>
                                </div>
                                <div className="preview-row">
                                    <span className="preview-label">Liquidatable?</span>
                                    <span className="preview-value" style={{ color: Number((parseBigInt(victimCollateral) * 100n) / parseBigInt(victimDebt)) < Number(liquidationRatio) ? 'var(--health-green)' : 'var(--health-red)' }}>
                                        {Number((parseBigInt(victimCollateral) * 100n) / parseBigInt(victimDebt)) < Number(liquidationRatio) ? 'Yes ✓' : 'No ✗'}
                                    </span>
                                </div>
                            </div>
                        )}
                    </>
                )}

                <button
                    id={`btn-${tab}`}
                    className={`btn ${tab === 'liquidate' ? 'btn-danger' : 'btn-primary'} btn-full`}
                    onClick={handleSubmit}
                    disabled={state.actionLoading || !canSubmit}
                >
                    {state.actionLoading ? (
                        <>
                            <span className="spinner" />
                            Generating ZK proof & submitting...
                        </>
                    ) : (
                        <>
                            {tabs.find(t => t.key === tab)?.icon}{' '}
                            {tab === 'deposit' ? 'Deposit Collateral' :
                                tab === 'mint' ? 'Mint pUSD' :
                                    tab === 'repay' ? 'Repay pUSD' :
                                        tab === 'withdraw' ? 'Withdraw Collateral' :
                                            'Liquidate Position'}
                        </>
                    )}
                </button>

                {state.actionLoading && (
                    <div className="alert alert-info" style={{ marginTop: '0.75rem' }}>
                        ⏳ Your browser is generating a zero-knowledge proof. This can take 30–120 seconds depending on the circuit.
                    </div>
                )}
            </div>
        </div>
    );
};

function parseBigInt(s: string): bigint {
    try {
        const cleaned = s.replace(/[^0-9]/g, '');
        return cleaned ? BigInt(cleaned) : 0n;
    } catch {
        return 0n;
    }
}

function getRatioColor(ratio: number): string {
    if (ratio >= 170) return 'var(--health-green)';
    if (ratio >= 150) return 'var(--health-yellow)';
    return 'var(--health-red)';
}
