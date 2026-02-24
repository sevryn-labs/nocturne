// pUSD Lending Protocol — Actions Page
// Card-based interface for all lending operations.

import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context.tsx';
import { useNavigate } from 'react-router-dom';
import { Tooltip, RiskBar } from '../components/UI.tsx';

type ActionTab = 'deposit' | 'mint' | 'repay' | 'withdraw' | 'liquidate';

export const Actions: React.FC = () => {
    const { state, actions } = useApp();
    const navigate = useNavigate();
    const [selectedAction, setSelectedAction] = useState<ActionTab | null>(null);

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

    const collateral = state.position ? BigInt(state.position.collateralAmount) : 0n;
    const debt = state.position ? BigInt(state.position.debtAmount) : 0n;
    const liquidationRatio = state.protocol ? Number(state.protocol.liquidationRatio) : 150;

    const currentRatio = debt > 0n
        ? Number((collateral * 100n) / debt)
        : collateral > 0n ? Infinity : 0;

    const previewRatio = useMemo(() => {
        const amtBig = parseBigInt(amount);
        if (amtBig <= 0n || !selectedAction) return null;

        let newCollateral = collateral;
        let newDebt = debt;

        switch (selectedAction) {
            case 'deposit': newCollateral = collateral + amtBig; break;
            case 'mint': newDebt = debt + amtBig; break;
            case 'repay': newDebt = debt - amtBig; if (newDebt < 0n) newDebt = 0n; break;
            case 'withdraw': newCollateral = collateral - amtBig; if (newCollateral < 0n) newCollateral = 0n; break;
            default: return null;
        }

        if (newDebt === 0n) return { ratio: Infinity, safe: true };
        const ratio = Number((newCollateral * 100n) / newDebt);
        return { ratio, safe: ratio >= liquidationRatio };
    }, [amount, selectedAction, collateral, debt, liquidationRatio]);

    const handleSubmit = async () => {
        if (!selectedAction) return;
        if (selectedAction === 'liquidate') {
            await actions.liquidate(victimCollateral, victimDebt);
        } else {
            const actionFn = { deposit: actions.deposit, mint: actions.mint, repay: actions.repay, withdraw: actions.withdraw }[selectedAction];
            await actionFn(amount);
        }
        setAmount('');
        setVictimCollateral('');
        setVictimDebt('');
        setSelectedAction(null);
    };

    const actionCards: { key: ActionTab; label: string; desc: string; icon: string; tooltip: string }[] = [
        {
            key: 'deposit',
            label: 'Deposit Collateral',
            desc: 'Lock tNight to enable borrowing.',
            icon: '📥',
            tooltip: 'Locking more collateral improves your health factor and allows you to mint more pUSD.'
        },
        {
            key: 'mint',
            label: 'Mint pUSD',
            desc: 'Borrow synthetic credit against your collateral.',
            icon: '🪙',
            tooltip: 'Minting pUSD increases your debt. Ensure your ratio stays above 150%.'
        },
        {
            key: 'repay',
            label: 'Repay pUSD',
            desc: 'Reduce your debt and improve your health factor.',
            icon: '💸',
            tooltip: 'Repaying pUSD removes debt from your position, making it safer from liquidation.'
        },
        {
            key: 'withdraw',
            label: 'Withdraw Collateral',
            desc: 'Reclaim tNight if your ratio remains safe.',
            icon: '📤',
            tooltip: 'You can only withdraw collateral if your remaining ratio stays above 150%.'
        },
        {
            key: 'liquidate',
            label: 'Liquidate',
            desc: 'Close an undercollateralised position and claim collateral.',
            icon: '⚡',
            tooltip: 'Liquidation is a public action to maintain protocol health. Requires repaying the victim\'s debt.'
        },
    ];

    return (
        <div className="animate-fade-in">
            <header className="page-header" style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Actions</h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    All lending operations generate zero-knowledge proofs locally on your machine.
                </p>
            </header>

            {!selectedAction ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '24px' }}>
                    {actionCards.map(card => (
                        <div key={card.key} className="card action-card" onClick={() => setSelectedAction(card.key)} style={{ cursor: 'pointer' }}>
                            <div className="action-header">
                                <span className="action-icon">{card.icon}</span>
                                <h3 style={{ fontSize: '18px' }}>{card.label}</h3>
                                <div style={{ marginLeft: 'auto' }}>
                                    <Tooltip label="" content={card.tooltip} />
                                </div>
                            </div>
                            <p className="action-desc">{card.desc}</p>
                            <button className="btn btn-ghost" style={{ marginTop: 'auto', alignSelf: 'flex-start' }}>
                                Start Action →
                            </button>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="card animate-fade-in" style={{ maxWidth: '600px', margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '32px' }}>
                        <button className="btn btn-ghost" onClick={() => setSelectedAction(null)} style={{ padding: '8px' }}>
                            ← Back
                        </button>
                        <h2 style={{ fontSize: '24px' }}>
                            {actionCards.find(c => c.key === selectedAction)?.icon}{' '}
                            {actionCards.find(c => c.key === selectedAction)?.label}
                        </h2>
                    </div>

                    {state.actionError && <div className="status-red" style={{ padding: '12px', borderRadius: '10px', marginBottom: '20px' }}>⚠ {state.actionError}</div>}
                    {state.lastTxHash && <div className="status-green" style={{ padding: '12px', borderRadius: '10px', marginBottom: '20px' }}>✅ Success! TX: {state.lastTxHash.slice(0, 10)}...</div>}

                    {selectedAction !== 'liquidate' ? (
                        <>
                            <div className="form-group">
                                <label className="form-label">
                                    {selectedAction === 'deposit' ? 'tNight to Lock' :
                                        selectedAction === 'withdraw' ? 'tNight to Reclaim' :
                                            selectedAction === 'mint' ? 'pUSD to Mint' : 'pUSD to Repay'}
                                </label>
                                <input
                                    className="form-input"
                                    type="text"
                                    value={amount}
                                    onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                                    placeholder="0"
                                    autoFocus
                                />
                                {selectedAction === 'repay' && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>Max: {debt.toLocaleString()} pUSD</div>}
                                {selectedAction === 'withdraw' && <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>Max: {collateral.toLocaleString()} tN</div>}
                            </div>

                            {previewRatio && (
                                <div className="glass-panel" style={{ marginBottom: '24px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                        <span style={{ color: 'var(--text-secondary)', fontSize: '14px' }}>Projected Health</span>
                                        <span style={{ fontWeight: 'bold', color: previewRatio.safe ? 'var(--status-success)' : 'var(--status-error)' }}>
                                            {previewRatio.ratio === Infinity ? '∞' : `${previewRatio.ratio.toFixed(1)}%`}
                                        </span>
                                    </div>
                                    <RiskBar ratio={previewRatio.ratio} />
                                    {!previewRatio.safe && <p style={{ fontSize: '12px', color: 'var(--status-error)', marginTop: '8px' }}>⚠ This action would lead to immediate liquidation risk.</p>}
                                </div>
                            )}
                        </>
                    ) : (
                        <div style={{ display: 'grid', gap: '20px' }}>
                            <div className="form-group">
                                <label className="form-label">Victim's Collateral (tNight)</label>
                                <input className="form-input" type="text" value={victimCollateral} onChange={(e) => setVictimCollateral(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
                            </div>
                            <div className="form-group">
                                <label className="form-label">Victim's Debt (pUSD)</label>
                                <input className="form-input" type="text" value={victimDebt} onChange={(e) => setVictimDebt(e.target.value.replace(/[^0-9]/g, ''))} placeholder="0" />
                            </div>
                        </div>
                    )}

                    <button
                        className="btn btn-primary"
                        style={{ width: '100%', marginTop: '20px' }}
                        onClick={handleSubmit}
                        disabled={state.actionLoading || (selectedAction === 'liquidate' ? !victimCollateral : !amount)}
                    >
                        {state.actionLoading ? <div className="loading-orbit" style={{ width: '20px', height: '20px' }} /> : 'Confirm Transaction'}
                    </button>

                    {state.actionLoading && (
                        <p style={{ marginTop: '16px', fontSize: '13px', color: 'var(--text-muted)', textAlign: 'center' }}>
                            Generating ZK proof... Please do not close your browser.
                        </p>
                    )}
                </div>
            )}
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
