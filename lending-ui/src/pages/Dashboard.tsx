// pUSD Lending Protocol: Dashboard Page
// Shows public protocol state and private position snapshot.

import React, { useEffect } from 'react';
import { useApp } from '../context.tsx';
import { useNavigate } from 'react-router-dom';
import { Tooltip, RiskBar } from '../components/UI.tsx';

export const Dashboard: React.FC = () => {
    const { state, actions } = useApp();
    const navigate = useNavigate();

    useEffect(() => {
        if (!state.wallet || !state.contractAddress) {
            navigate('/setup');
            return;
        }
        // if (state.health?.ready) {
        //     actions.refreshProtocol();
        //     actions.refreshPosition();
        // }
    }, [state.wallet, state.contractAddress]);

    const protocol = state.protocol;
    const position = state.position;

    // Protocol Stats
    const totalCollateral = protocol ? BigInt(protocol.totalCollateral) : 0n;
    const totalDebt = protocol ? BigInt(protocol.totalDebt) : 0n;
    const liquidationRatio = protocol ? Number(protocol.liquidationRatio) : 150;
    const mintingRatio = protocol ? Number(protocol.mintingRatio) : 150;

    // My Position Stats
    const myCollateral = position ? BigInt(position.collateralAmount) : 0n;
    const myDebt = position ? BigInt(position.debtAmount) : 0n;

    const myRatio = myDebt > 0n
        ? Number((myCollateral * 100n) / myDebt)
        : myCollateral > 0n ? Infinity : 0;

    const getHealthClass = (ratio: number) => {
        if (myDebt === 0n || ratio === Infinity || ratio >= 170) return 'status-green';
        if (ratio >= 150) return 'status-yellow';
        return 'status-red';
    };

    const getHealthLabel = (ratio: number) => {
        if (myDebt === 0n) return 'No Position';
        if (ratio === Infinity || ratio >= 170) return 'Healthy';
        if (ratio >= 150) return 'At Risk';
        return 'Liquidatable';
    };

    return (
        <div className="animate-fade-in">
            <header className="page-header" style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Dashboard</h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Overview of the pUSD Lending Protocol and your current position.
                </p>
            </header>

            <h2 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--accent-primary)' }}>◈</span> Protocol Overview
            </h2>

            <div className="dashboard-overview">
                <div className="card stat-card">
                    <Tooltip
                        label="Total Collateral"
                        content="Total tNight tokens locked by all users in the protocol."
                    />
                    <div className="stat-value">
                        {totalCollateral.toLocaleString()} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>tN</span>
                    </div>
                </div>

                <div className="card stat-card">
                    <Tooltip
                        label="Total Debt"
                        content="Total pUSD currently minted and outstanding across the protocol."
                    />
                    <div className="stat-value" style={{ color: 'var(--accent-secondary)' }}>
                        {totalDebt.toLocaleString()} <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>pUSD</span>
                    </div>
                </div>

                <div className="card stat-card">
                    <Tooltip
                        label="Liquidation Ratio"
                        content="If a position's collateral ratio falls below this threshold, it can be liquidated."
                    />
                    <div className="stat-value">
                        {liquidationRatio}%
                    </div>
                </div>

                <div className="card stat-card">
                    <Tooltip
                        label="Minting Ratio"
                        content="Minimum collateral ratio required to mint new pUSD."
                    />
                    <div className="stat-value">
                        {mintingRatio}%
                    </div>
                </div>
            </div>

            <h2 style={{ fontSize: '18px', marginBottom: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: 'var(--accent-primary)' }}>👤</span> My Position Snapshot
            </h2>

            <div className="card position-snapshot">
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px' }}>
                    <div>
                        <Tooltip label="My Collateral" content="Total tNight tokens you have locked in this position." />
                        <div className="stat-value" style={{ fontSize: '32px', marginTop: '8px' }}>
                            {myCollateral.toLocaleString()} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>tN</span>
                        </div>

                        <div style={{ marginTop: '24px' }}>
                            <Tooltip label="My Debt" content="Total pUSD you have borrowed against your collateral." />
                        </div>
                        <div className="stat-value" style={{ fontSize: '32px', marginTop: '8px', color: 'var(--accent-secondary)' }}>
                            {myDebt.toLocaleString()} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>pUSD</span>
                        </div>
                    </div>

                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', borderLeft: '1px solid var(--border-color)', paddingLeft: '32px' }}>
                        <div className="stat-label" style={{ marginBottom: '16px' }}>HEALTH FACTOR</div>
                        <div className={`health-status ${getHealthClass(myRatio)}`} style={{ padding: '12px 24px', fontSize: '20px' }}>
                            {getHealthLabel(myRatio)}
                        </div>
                        <div style={{ marginTop: '12px', fontSize: '14px', color: 'var(--text-muted)' }}>
                            Ratio: {myRatio === Infinity ? '∞' : `${myRatio.toFixed(1)}%`}
                        </div>
                    </div>
                </div>

                <div style={{ marginTop: '40px', paddingTop: '32px', borderTop: '1px solid var(--border-color)' }}>
                    <RiskBar ratio={myRatio} />
                </div>

                <div style={{ marginTop: '32px', display: 'flex', gap: '16px' }}>
                    <button className="btn btn-primary" onClick={() => navigate('/actions')}>
                        Manage Position
                    </button>
                    <button className="btn btn-ghost" onClick={() => navigate('/position')}>
                        Full Details
                    </button>
                </div>
            </div>
        </div>
    );
};
