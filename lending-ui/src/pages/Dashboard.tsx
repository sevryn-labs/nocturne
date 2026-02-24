// pUSD Lending Protocol — Dashboard Page
// Shows public protocol state: totalCollateral, totalDebt, ratios.

import React, { useEffect } from 'react';
import { useApp } from '../context.tsx';
import { useNavigate } from 'react-router-dom';

export const Dashboard: React.FC = () => {
    const { state, actions } = useApp();
    const navigate = useNavigate();

    useEffect(() => {
        if (!state.wallet || !state.contractAddress) {
            navigate('/setup');
            return;
        }
        actions.refreshProtocol();
        const interval = setInterval(() => actions.refreshProtocol(), 30_000);
        return () => clearInterval(interval);
    }, [state.wallet, state.contractAddress]);

    const protocol = state.protocol;

    const totalCollateral = protocol ? BigInt(protocol.totalCollateral) : 0n;
    const totalDebt = protocol ? BigInt(protocol.totalDebt) : 0n;
    const liquidationRatio = protocol ? BigInt(protocol.liquidationRatio) : 150n;
    const mintingRatio = protocol ? BigInt(protocol.mintingRatio) : 150n;

    const utilizationRate = totalCollateral > 0n
        ? Number((totalDebt * 10000n) / totalCollateral) / 100
        : 0;

    const globalRatio = totalDebt > 0n
        ? Number((totalCollateral * 100n) / totalDebt)
        : totalCollateral > 0n ? Infinity : 0;

    return (
        <div className="animate-in">
            <div className="page-header">
                <h1 className="page-title">Protocol Dashboard</h1>
                <p className="page-subtitle">
                    Public on-chain state of the pUSD lending protocol.
                    {state.contractAddress && (
                        <span style={{ display: 'block', marginTop: '0.25rem' }}>
                            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>Contract: </span>
                            <span className="address-display">{state.contractAddress}</span>
                        </span>
                    )}
                </p>
            </div>

            {/* Main Stats */}
            <div className="stat-grid">
                <div className="card stat-card animate-in">
                    <div className="stat-label">Total Collateral</div>
                    {state.protocolLoading && !protocol ? (
                        <div className="skeleton skeleton-value" />
                    ) : (
                        <div className="stat-value">
                            {formatBigInt(totalCollateral)}
                            <span className="stat-suffix">tNight</span>
                        </div>
                    )}
                </div>

                <div className="card stat-card animate-in">
                    <div className="stat-label">Total Debt</div>
                    {state.protocolLoading && !protocol ? (
                        <div className="skeleton skeleton-value" />
                    ) : (
                        <div className="stat-value accent">
                            {formatBigInt(totalDebt)}
                            <span className="stat-suffix">pUSD</span>
                        </div>
                    )}
                </div>

                <div className="card stat-card animate-in">
                    <div className="stat-label">Liquidation Ratio</div>
                    <div className="stat-value">
                        {liquidationRatio.toString()}
                        <span className="stat-suffix">%</span>
                    </div>
                </div>

                <div className="card stat-card animate-in">
                    <div className="stat-label">Minting Ratio</div>
                    <div className="stat-value">
                        {mintingRatio.toString()}
                        <span className="stat-suffix">%</span>
                    </div>
                </div>
            </div>

            {/* Protocol Health */}
            <div className="card animate-in" style={{ marginBottom: '1rem' }}>
                <div className="card-header">
                    <div className="card-title">
                        <span className="icon">📊</span>
                        Protocol Health
                    </div>
                    <button
                        className="btn btn-secondary"
                        onClick={() => actions.refreshProtocol()}
                        disabled={state.protocolLoading}
                        style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                        {state.protocolLoading ? <span className="spinner" /> : '↻ Refresh'}
                    </button>
                </div>

                <div className="preview-row">
                    <span className="preview-label">Protocol Collateral Ratio</span>
                    <span className="preview-value" style={{ color: getRatioColor(globalRatio) }}>
                        {globalRatio === Infinity ? '∞' : `${globalRatio}%`}
                    </span>
                </div>

                <div className="preview-row">
                    <span className="preview-label">Utilization Rate</span>
                    <span className="preview-value">{utilizationRate.toFixed(2)}%</span>
                </div>

                <div className="preview-row">
                    <span className="preview-label">Max Mintable (from current collateral)</span>
                    <span className="preview-value" style={{ color: 'var(--accent-secondary)' }}>
                        {totalCollateral > 0n ? formatBigInt((totalCollateral * 100n) / mintingRatio) : '0'} pUSD
                    </span>
                </div>

                {totalDebt > 0n && (
                    <div className="ratio-bar-container">
                        <div className="ratio-bar-labels">
                            <span>0%</span>
                            <span>150% (min)</span>
                            <span>300%+</span>
                        </div>
                        <div className="ratio-bar">
                            <div
                                className={`ratio-bar-fill ${getHealthClass(globalRatio)}`}
                                style={{ width: `${Math.min(globalRatio / 3, 100)}%` }}
                            />
                            <div className="ratio-bar-threshold" style={{ left: '50%' }} />
                        </div>
                    </div>
                )}
            </div>

            {/* Quick Actions */}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button className="btn btn-secondary" onClick={() => navigate('/position')}>
                    👤 View My Position
                </button>
                <button className="btn btn-primary" onClick={() => navigate('/actions')}>
                    💰 Lending Actions
                </button>
            </div>
        </div>
    );
};

function formatBigInt(val: bigint): string {
    return val.toLocaleString();
}

function getRatioColor(ratio: number): string {
    if (ratio === Infinity) return 'var(--health-green)';
    if (ratio >= 170) return 'var(--health-green)';
    if (ratio >= 150) return 'var(--health-yellow)';
    return 'var(--health-red)';
}

function getHealthClass(ratio: number): string {
    if (ratio >= 170) return 'healthy';
    if (ratio >= 150) return 'warning';
    return 'danger';
}
