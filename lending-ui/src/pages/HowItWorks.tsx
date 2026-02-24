import React from 'react';

export const HowItWorks: React.FC = () => {
    return (
        <div className="animate-fade-in">
            <header className="page-header" style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>How It Works</h1>
                <p style={{ color: 'var(--text-secondary)' }}>
                    Learn about pUSD, collateralisation, and the privacy-preserving model of the protocol.
                </p>
            </header>

            <div style={{ display: 'grid', gap: '32px' }}>
                <section className="card">
                    <h2 style={{ color: 'var(--accent-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span>01</span> What is pUSD?
                    </h2>
                    <p style={{ lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                        pUSD is a <strong>synthetic internal credit unit</strong> within the Midnight Network.
                        Unlike traditional tokens, pUSD exists purely as an accounting mechanism within the lending smart contract,
                        secured by overcollateralised tNight (Midnight Testnet tokens).
                    </p>
                </section>

                <section className="card">
                    <h2 style={{ color: 'var(--accent-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span>02</span> Collateral & Debt
                    </h2>
                    <p style={{ lineHeight: '1.6', color: 'var(--text-secondary)', marginBottom: '20px' }}>
                        To borrow pUSD, you must first lock tNight as collateral. The protocol enforces a
                        <strong> Minimum Collateral Ratio of 150%</strong>.
                    </p>
                    <div className="glass-panel" style={{ textAlign: 'center', padding: '24px' }}>
                        <div style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '10px' }}>COLLATERAL RATIO FORMULA</div>
                        <div style={{ fontStyle: 'italic', fontSize: '20px', fontWeight: 600 }}>
                            (Collateral Amount × 100) / Debt Amount
                        </div>
                    </div>
                </section>

                <section className="card">
                    <h2 style={{ color: 'var(--accent-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span>03</span> Liquidation
                    </h2>
                    <p style={{ lineHeight: '1.6', color: 'var(--text-secondary)' }}>
                        If the value of your collateral drops—or your debt increases—such that your ratio falls below <strong>150%</strong>,
                        your position becomes <strong>liquidatable</strong>. Any user can "liquidate" an undercollateralised position
                        by paying back the debt and claiming the locked collateral.
                    </p>
                </section>

                <section className="card">
                    <h2 style={{ color: 'var(--accent-secondary)', marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <span>04</span> Privacy Model (ZK Proofs)
                    </h2>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '32px', marginTop: '16px' }}>
                        <div>
                            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Private Side</h3>
                            <ul style={{ color: 'var(--text-secondary)', paddingLeft: '20px', lineHeight: '1.8' }}>
                                <li>Individual Collateral Amounts</li>
                                <li>Individual Debt Amounts</li>
                                <li>User Wallet Addresses</li>
                            </ul>
                        </div>
                        <div>
                            <h3 style={{ fontSize: '16px', marginBottom: '12px' }}>Public Side</h3>
                            <ul style={{ color: 'var(--text-secondary)', paddingLeft: '20px', lineHeight: '1.8' }}>
                                <li>Total Protocol Collateral</li>
                                <li>Total Protocol Debt</li>
                                <li>Global Liquidation Ratios</li>
                            </ul>
                        </div>
                    </div>
                    <p style={{ marginTop: '24px', fontSize: '14px', color: 'var(--text-muted)', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                        Zero-Knowledge Proofs (ZKPs) allow you to prove that you have enough collateral to mint pUSD
                        without ever revealing exactly how much tNight you own on the public ledger.
                    </p>
                </section>
            </div>
        </div>
    );
};
