// pUSD Lending Protocol — My Position Page
// Shows private position details and health metrics.

import React, { useEffect } from 'react';
import { useApp } from '../context.tsx';
import { useNavigate } from 'react-router-dom';
import { RiskBar, Tooltip } from '../components/UI.tsx';

export const Position: React.FC = () => {
    const { state, actions } = useApp();
    const navigate = useNavigate();

    useEffect(() => {
        if (!state.wallet || !state.contractAddress) {
            navigate('/setup');
        }
    }, [state.wallet, state.contractAddress]);

    const position = state.position;
    const protocol = state.protocol;

    const collateral = position ? BigInt(position.collateralAmount) : 0n;
    const debt = position ? BigInt(position.debtAmount) : 0n;

    const ratio = debt > 0n
        ? Number((collateral * 100n) / debt)
        : collateral > 0n ? Infinity : 0;

    const liquidationRatio = protocol ? Number(protocol.liquidationRatio) : 150;
    const mintingRatio = protocol ? Number(protocol.mintingRatio) : 150;

    // Max additional pUSD that can be minted
    const maxMintable = collateral > 0n && mintingRatio > 0
        ? (collateral * 100n) / BigInt(mintingRatio) - debt
        : 0n;

    // Max collateral that can be withdrawn (while keeping ratio ≥ liquidation)
    const maxWithdrawable = debt > 0n && liquidationRatio > 0
        ? collateral - (debt * BigInt(liquidationRatio)) / 100n
        : collateral;

    const getHealthClass = (r: number) => {
        if (debt === 0n || r === Infinity || r >= 170) return 'status-green';
        if (r >= 150) return 'status-yellow';
        return 'status-red';
    };

    const getHealthLabel = (r: number) => {
        if (debt === 0n) return 'No Position';
        if (r === Infinity || r >= 170) return 'Healthy';
        if (r >= 150) return 'At Risk';
        return 'Liquidatable';
    };

    return (
        <div className="animate-fade-in">
            <header className="page-header" style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>My Position</h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Your private position data is collateralised by ZK proofs. Only you can see these amounts.
                </p>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '32px' }}>
                <div style={{ display: 'grid', gap: '32px' }}>
                    {/* Main Stats Card */}
                    <div className="card">
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div className="stat-card">
                                <Tooltip label="My Collateral" content="Total tNight tokens you have locked in this position." />
                                <div className="stat-value" style={{ fontSize: '32px' }}>
                                    {collateral.toLocaleString()} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>tN</span>
                                </div>
                            </div>
                            <div className="stat-card">
                                <Tooltip label="My Debt" content="Total pUSD you have borrowed against your collateral." />
                                <div className="stat-value" style={{ fontSize: '32px', color: 'var(--accent-secondary)' }}>
                                    {debt.toLocaleString()} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>pUSD</span>
                                </div>
                            </div>
                        </div>

                        <div className="glass-panel" style={{ marginTop: '32px' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '12px', alignItems: 'center' }}>
                                <span style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-secondary)' }}>Health Factor</span>
                                <div className={`health-status ${getHealthClass(ratio)}`}>
                                    {getHealthLabel(ratio)}
                                </div>
                            </div>
                            <RiskBar ratio={ratio} />
                        </div>
                    </div>

                    {/* Technical Limits Card */}
                    <div className="card">
                        <h3 style={{ fontSize: '18px', marginBottom: '24px' }}>Technical Limits</h3>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
                            <div>
                                <div className="stat-label" style={{ fontSize: '12px' }}>Max Additional Mint</div>
                                <div style={{ fontSize: '20px', fontWeight: 600, marginTop: '8px' }}>
                                    {maxMintable > 0n ? maxMintable.toLocaleString() : '0'} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>pUSD</span>
                                </div>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Based on {mintingRatio}% Minting Ratio</p>
                            </div>
                            <div>
                                <div className="stat-label" style={{ fontSize: '12px' }}>Max Safe Withdrawal</div>
                                <div style={{ fontSize: '20px', fontWeight: 600, marginTop: '8px' }}>
                                    {maxWithdrawable > 0n ? maxWithdrawable.toLocaleString() : '0'} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>tN</span>
                                </div>
                                <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '8px' }}>Based on {liquidationRatio}% Liq. Ratio</p>
                            </div>
                        </div>
                    </div>
                </div>

                <div style={{ display: 'grid', gap: '32px', gridAutoRows: 'min-content' }}>
                    <div className="card glass-panel" style={{ border: '1px solid var(--accent-primary-glow)' }}>
                        <h3 style={{ fontSize: '16px', marginBottom: '16px', color: 'var(--accent-primary)' }}>Quick Actions</h3>
                        <div style={{ display: 'grid', gap: '12px' }}>
                            <button className="btn btn-primary" onClick={() => navigate('/actions')}>Manage Liquidity</button>
                            <button className="btn btn-ghost" onClick={() => navigate('/dashboard')}>Back to Stats</button>
                        </div>
                    </div>

                    <div className="card" style={{ background: 'transparent' }}>
                        <h3 style={{ fontSize: '16px', marginBottom: '16px' }}>ZK Privacy Status</h3>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start', marginBottom: '16px' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-success)', marginTop: '6px' }}></div>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                                Amounts are obfuscated on-chain using <strong>Pedersen Commitments</strong>.
                            </p>
                        </div>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
                            <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-success)', marginTop: '6px' }}></div>
                            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: '1.5' }}>
                                Position solvency proven via <strong>Halo2</strong> zero-knowledge proofs.
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
