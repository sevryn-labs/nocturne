// pUSD Lending Protocol — My Position Page
// Shows private state: collateral, debt, health, and ratio visualization.

import React, { useEffect } from 'react';
import { useApp } from '../context.tsx';
import { useNavigate } from 'react-router-dom';

export const Position: React.FC = () => {
    const { state, actions } = useApp();
    const navigate = useNavigate();

    useEffect(() => {
        if (!state.wallet || !state.contractAddress) {
            navigate('/setup');
            return;
        }
        actions.refreshPosition();
        actions.refreshProtocol();
    }, [state.wallet, state.contractAddress]);

    const position = state.position;
    const protocol = state.protocol;

    const collateral = position ? BigInt(position.collateralAmount) : 0n;
    const debt = position ? BigInt(position.debtAmount) : 0n;
    const ratio = position ? Number(BigInt(position.collateralRatio)) : 0;
    const isLiquidatable = position?.isLiquidatable ?? false;

    const liquidationRatio = protocol ? Number(BigInt(protocol.liquidationRatio)) : 150;
    const mintingRatio = protocol ? Number(BigInt(protocol.mintingRatio)) : 150;

    // Max additional pUSD that can be minted
    const maxMintable = collateral > 0n && BigInt(mintingRatio) > 0n
        ? (collateral * 100n) / BigInt(mintingRatio) - debt
        : 0n;

    // Max collateral that can be withdrawn (while keeping ratio ≥ liquidation)
    const maxWithdrawable = debt > 0n && BigInt(liquidationRatio) > 0n
        ? collateral - (debt * BigInt(liquidationRatio)) / 100n
        : collateral;

    const healthLabel = getHealthLabel(ratio, debt > 0n);
    const healthClass = getHealthClass(ratio, debt > 0n);

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1 className="page-title">My Position</h1>
                <p className="page-subtitle">
                    Your private lending position — stored locally, proven via ZK.
                    This data never leaves your machine.
                </p>
            </div>

            {/* Health Banner */}
            {position && debt > 0n && (
                <div className={`card animate-in`} style={{ marginBottom: '1rem', borderColor: getHealthBorderColor(healthClass) }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                        <div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.25rem' }}>
                                <span className={`health-badge ${healthClass}`}>
                                    {healthClass === 'healthy' ? '🛡' : healthClass === 'warning' ? '⚠️' : '🚨'} {healthLabel}
                                </span>
                                {isLiquidatable && (
                                    <span className="health-badge danger">LIQUIDATABLE</span>
                                )}
                            </div>
                            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                Collateral ratio: {ratio}% | Liquidation threshold: {liquidationRatio}%
                            </span>
                        </div>
                        <div style={{ textAlign: 'right' }}>
                            <div style={{ fontSize: '2rem', fontWeight: 700, fontFamily: 'var(--font-mono)', color: getRatioColor(ratio) }}>
                                {ratio}%
                            </div>
                        </div>
                    </div>

                    {/* Ratio Bar */}
                    <div className="ratio-bar-container">
                        <div className="ratio-bar-labels">
                            <span>0%</span>
                            <span style={{ color: 'var(--health-red)' }}>150%</span>
                            <span style={{ color: 'var(--health-yellow)' }}>170%</span>
                            <span>300%+</span>
                        </div>
                        <div className="ratio-bar">
                            <div
                                className={`ratio-bar-fill ${healthClass}`}
                                style={{ width: `${Math.min(ratio / 3, 100)}%` }}
                            />
                            {/* Liquidation threshold marker */}
                            <div className="ratio-bar-threshold" style={{ left: `${(liquidationRatio / 3)}%` }} />
                            {/* Warning threshold marker */}
                            <div className="ratio-bar-threshold" style={{ left: `${(170 / 3)}%`, background: 'var(--health-yellow)', opacity: 0.4 }} />
                        </div>
                    </div>
                </div>
            )}

            {/* Position Stats */}
            <div className="stat-grid">
                <div className="card stat-card animate-in">
                    <div className="stat-label">Collateral Deposited</div>
                    {state.positionLoading && !position ? (
                        <div className="skeleton skeleton-value" />
                    ) : (
                        <div className="stat-value">
                            {collateral.toLocaleString()}
                            <span className="stat-suffix">tNight</span>
                        </div>
                    )}
                </div>

                <div className="card stat-card animate-in">
                    <div className="stat-label">Debt Outstanding</div>
                    {state.positionLoading && !position ? (
                        <div className="skeleton skeleton-value" />
                    ) : (
                        <div className="stat-value accent">
                            {debt.toLocaleString()}
                            <span className="stat-suffix">pUSD</span>
                        </div>
                    )}
                </div>

                <div className="card stat-card animate-in">
                    <div className="stat-label">Available to Mint</div>
                    <div className="stat-value" style={{ color: maxMintable > 0n ? 'var(--accent-secondary)' : 'var(--text-muted)' }}>
                        {maxMintable > 0n ? maxMintable.toLocaleString() : '0'}
                        <span className="stat-suffix">pUSD</span>
                    </div>
                </div>

                <div className="card stat-card animate-in">
                    <div className="stat-label">Available to Withdraw</div>
                    <div className="stat-value" style={{ color: maxWithdrawable > 0n ? 'var(--health-green)' : 'var(--text-muted)' }}>
                        {maxWithdrawable > 0n ? maxWithdrawable.toLocaleString() : '0'}
                        <span className="stat-suffix">tNight</span>
                    </div>
                </div>
            </div>

            {/* Privacy Note */}
            <div className="card animate-in">
                <div className="card-header">
                    <div className="card-title">
                        <span className="icon">🔒</span>
                        Privacy Note
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={() => {
                            actions.refreshPosition();
                            actions.refreshProtocol();
                        }}
                        disabled={state.positionLoading}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                        {state.positionLoading ? <span className="spinner" /> : '↻ Refresh'}
                    </button>
                </div>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                    Your collateral and debt amounts are stored in your <strong>local LevelDB</strong> database — they are
                    never revealed on-chain. When you perform lending actions, the Compact contract uses
                    <strong> zero-knowledge proofs </strong> to verify constraints (e.g., collateral ratio ≥ {liquidationRatio}%)
                    without disclosing your actual position to anyone.
                </p>
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem' }}>
                <button className="btn btn-primary" onClick={() => navigate('/actions')}>
                    💰 Lending Actions
                </button>
                <button className="btn btn-secondary" onClick={() => navigate('/dashboard')}>
                    📊 Protocol Dashboard
                </button>
            </div>
        </div>
    );
};

function getHealthLabel(ratio: number, hasDebt: boolean): string {
    if (!hasDebt) return 'No Debt';
    if (ratio >= 170) return 'Healthy';
    if (ratio >= 150) return 'At Risk';
    return 'Critical';
}

function getHealthClass(ratio: number, hasDebt: boolean): string {
    if (!hasDebt) return 'healthy';
    if (ratio >= 170) return 'healthy';
    if (ratio >= 150) return 'warning';
    return 'danger';
}

function getRatioColor(ratio: number): string {
    if (ratio >= 170) return 'var(--health-green)';
    if (ratio >= 150) return 'var(--health-yellow)';
    return 'var(--health-red)';
}

function getHealthBorderColor(healthClass: string): string {
    if (healthClass === 'healthy') return 'rgba(0, 184, 148, 0.2)';
    if (healthClass === 'warning') return 'rgba(253, 203, 110, 0.3)';
    return 'rgba(225, 112, 85, 0.3)';
}
