import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AppProvider, useApp } from './context.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Position } from './pages/Position.tsx';
import { Actions } from './pages/Actions.tsx';
import { Setup } from './pages/Setup.tsx';
import { HowItWorks } from './pages/HowItWorks.tsx';
import { Tooltip } from './components/UI.tsx';
import './index.css';

// ─── Moon Crescent (reusable, matches Setup.tsx) ──────────────────────────────

const MoonCrescent: React.FC<{ size?: number }> = ({ size = 22 }) => (
    <div
        style={{
            width: size,
            height: size,
            borderRadius: '50%',
            flexShrink: 0,
            boxShadow: `inset -${Math.round(size * 0.28)}px ${Math.round(size * 0.07)}px 0 0 var(--moon-silver),
                  0 0 ${size * 0.6}px rgba(200,214,232,0.15),
                  0 0 ${size * 1.2}px rgba(108,99,255,0.08)`,
            border: '1px solid rgba(200, 214, 232, 0.13)',
        }}
    />
);

// ─── Nav icons — clean SVG-style unicode, consistent set ─────────────────────

const NAV_ICONS: Record<string, string> = {
    setup: '⚙',
    dashboard: '▦',
    position: '◎',
    actions: '⇆',
    howItWorks: '◈',
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const Sidebar: React.FC = () => {
    const { state } = useApp();
    const hasWallet = !!state.wallet;
    const hasContract = !!state.contractAddress;

    const totalCollateral = state.protocol ? BigInt(state.protocol.totalCollateral).toLocaleString() : '0';
    const totalDebt = state.protocol ? BigInt(state.protocol.totalDebt).toLocaleString() : '0';

    return (
        <aside className="sidebar">

            {/* Logo */}
            <div className="sidebar-logo">
                <MoonCrescent size={30} />
                <span className="logo-text">pUSD Lending</span>
            </div>

            {/* Navigation */}
            <nav className="nav-menu" style={{ flex: 1 }}>
                <NavLink to="/setup" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <span className="icon">{NAV_ICONS.setup}</span>
                    <span className="nav-text">Setup</span>
                </NavLink>

                {hasWallet && hasContract && (
                    <>
                        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            <span className="icon">{NAV_ICONS.dashboard}</span>
                            <span className="nav-text">Dashboard</span>
                        </NavLink>

                        <NavLink to="/position" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            <span className="icon">{NAV_ICONS.position}</span>
                            <span className="nav-text">My Position</span>
                        </NavLink>

                        <NavLink to="/actions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            <span className="icon">{NAV_ICONS.actions}</span>
                            <span className="nav-text">Actions</span>
                        </NavLink>
                    </>
                )}

                <NavLink to="/how-it-works" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    <span className="icon">{NAV_ICONS.howItWorks}</span>
                    <span className="nav-text">How It Works</span>
                </NavLink>
            </nav>

            {/* Protocol stats footer inside sidebar */}
            <div
                className="nav-text"
                style={{
                    padding: '20px 24px',
                    borderTop: '1px solid rgba(200, 214, 232, 0.06)',
                }}
            >
                {/* Constellation divider label */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span
                        style={{
                            fontSize: '10px',
                            fontWeight: 700,
                            letterSpacing: '0.1em',
                            color: 'var(--text-muted)',
                            textTransform: 'uppercase',
                        }}
                    >
                        Protocol Stats
                    </span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(200,214,232,0.06)' }} />
                    <span style={{ color: 'var(--moon-silver)', fontSize: '8px', opacity: 0.5 }}>✦</span>
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Collateral</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            {totalCollateral} tN
                        </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Debt</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                            {totalDebt} pUSD
                        </span>
                    </div>
                </div>
            </div>
        </aside>
    );
};

// ─── TopBar ───────────────────────────────────────────────────────────────────

const TopBar: React.FC = () => {
    const { state } = useApp();

    const shortenAddress = (addr: string) =>
        addr ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : 'Not Connected';

    const networkOk = !!state.health;
    const walletOk = !!state.wallet;

    return (
        <header className="topbar">

            {/* Left — network badge */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {state.health ? (
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            padding: '5px 12px',
                            borderRadius: '20px',
                            background: 'rgba(200, 214, 232, 0.05)',
                            border: '1px solid rgba(200, 214, 232, 0.1)',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--moon-silver)',
                            letterSpacing: '0.04em',
                        }}
                    >
                        {/* Pulsing dot */}
                        <span
                            style={{
                                position: 'relative',
                                display: 'inline-block',
                                width: '7px',
                                height: '7px',
                            }}
                        >
                            <span
                                style={{
                                    position: 'absolute',
                                    inset: 0,
                                    borderRadius: '50%',
                                    background: 'var(--status-success)',
                                    animation: 'pulse-ring 2s ease-out infinite',
                                }}
                            />
                            <span
                                style={{
                                    position: 'absolute',
                                    inset: '1px',
                                    borderRadius: '50%',
                                    background: 'var(--status-success)',
                                }}
                            />
                        </span>
                        {state.health.network}
                    </div>
                ) : (
                    <div
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '7px',
                            padding: '5px 12px',
                            borderRadius: '20px',
                            background: 'rgba(255,92,92,0.07)',
                            border: '1px solid rgba(255,92,92,0.18)',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--status-error)',
                        }}
                    >
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--status-error)', display: 'inline-block' }} />
                        Disconnected
                    </div>
                )}
            </div>

            {/* Right — DUST, contract address, status dots */}
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>

                {state.wallet && (
                    <div
                        className="glass-panel"
                        style={{ padding: '7px 14px', borderRadius: '12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                    >
                        <Tooltip label="DUST" content="Midnight network resource used to pay for private transaction proofs." />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginLeft: '4px' }}>
                            {state.wallet.dustBalance}
                        </span>
                    </div>
                )}

                <div
                    className="glass-panel"
                    style={{ padding: '7px 14px', borderRadius: '12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                    <Tooltip label="Contract" content="The active smart contract instance managing the lending protocol." />
                    <span style={{ color: 'var(--accent-secondary)', fontWeight: 600, fontFamily: 'monospace', marginLeft: '4px' }}>
                        {state.contractAddress ? shortenAddress(state.contractAddress) : 'No Contract'}
                    </span>
                </div>

                {/* Status indicators — network + wallet */}
                <div
                    style={{
                        display: 'flex',
                        gap: '6px',
                        alignItems: 'center',
                        padding: '7px 12px',
                        background: 'rgba(255,255,255,0.02)',
                        border: '1px solid rgba(255,255,255,0.05)',
                        borderRadius: '12px',
                    }}
                >
                    <StatusDot connected={networkOk} title="Network Health" />
                    <StatusDot connected={walletOk} title="Wallet Status" />
                </div>
            </div>

            {/* Pulse keyframe injected once */}
            <style>{`
        @keyframes pulse-ring {
          0%   { opacity: 0.6; transform: scale(1); }
          70%  { opacity: 0; transform: scale(2.2); }
          100% { opacity: 0; transform: scale(2.2); }
        }
      `}</style>
        </header>
    );
};

const StatusDot: React.FC<{ connected: boolean; title: string }> = ({ connected, title }) => (
    <div
        title={title}
        style={{
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: connected ? 'var(--status-success)' : 'var(--status-error)',
            boxShadow: connected
                ? '0 0 6px rgba(76,175,80,0.5)'
                : '0 0 6px rgba(255,92,92,0.4)',
            transition: 'background 0.3s ease, box-shadow 0.3s ease',
        }}
    />
);

// ─── Footer ───────────────────────────────────────────────────────────────────

const Footer: React.FC = () => (
    <footer
        style={{
            borderTop: '1px solid rgba(200, 214, 232, 0.06)',
            padding: '16px 32px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            fontSize: '12px',
            color: 'var(--text-muted)',
        }}
    >
        <MoonCrescent size={14} />
        <span>pUSD Lending Protocol</span>
        <FooterSep />
        <span>Built on Midnight Network</span>
        <FooterSep />
        <span>Powered by ZK Proofs</span>
        {/* Right-aligned star cluster */}
        <span style={{ marginLeft: 'auto', letterSpacing: '0.2em', opacity: 0.3, fontSize: '10px' }}>✦ ✦ ✦</span>
    </footer>
);

const FooterSep: React.FC = () => (
    <span style={{ color: 'rgba(200,214,232,0.15)', userSelect: 'none' }}>·</span>
);

// ─── Celestial background decorations ────────────────────────────────────────

const CelestialBg: React.FC = () => (
    <div className="app-bg">
        {/* Moon crescent — top right corner */}
        <div className="moon-decoration" />
        {/* Shooting star */}
        <div className="shooting-star" />
        {/* A handful of hand-placed twinkling stars */}
        {TWINKLE_STARS.map((s, i) => (
            <span
                key={i}
                className="star"
                style={{
                    left: s.x,
                    top: s.y,
                    width: s.size,
                    height: s.size,
                    '--twinkle-duration': s.duration,
                    '--twinkle-delay': s.delay,
                    '--twinkle-opacity': s.opacity,
                } as React.CSSProperties}
            />
        ))}
    </div>
);

const TWINKLE_STARS = [
    { x: '12%', y: '8%', size: '2px', duration: '3.5s', delay: '0s', opacity: 0.7 },
    { x: '28%', y: '22%', size: '1.5px', duration: '5s', delay: '1.2s', opacity: 0.5 },
    { x: '45%', y: '6%', size: '2px', duration: '4s', delay: '2.1s', opacity: 0.6 },
    { x: '62%', y: '15%', size: '1px', duration: '6s', delay: '0.5s', opacity: 0.4 },
    { x: '78%', y: '30%', size: '1.5px', duration: '4.5s', delay: '3s', opacity: 0.55 },
    { x: '91%', y: '9%', size: '2px', duration: '3s', delay: '1.8s', opacity: 0.65 },
    { x: '5%', y: '55%', size: '1px', duration: '7s', delay: '0.8s', opacity: 0.35 },
    { x: '35%', y: '80%', size: '1.5px', duration: '5.5s', delay: '2.5s', opacity: 0.45 },
    { x: '70%', y: '70%', size: '1px', duration: '4s', delay: '1s', opacity: 0.4 },
    { x: '88%', y: '60%', size: '2px', duration: '6s', delay: '3.5s', opacity: 0.6 },
];

// ─── AppContent ───────────────────────────────────────────────────────────────

const AppContent: React.FC = () => {
    const { state, actions } = useApp();
    const location = useLocation();

    // 1. Always poll health/connectivity
    useEffect(() => {
        actions.checkHealth();
        const interval = setInterval(() => actions.checkHealth(), 15_000);
        return () => clearInterval(interval);
    }, [actions]);

    // 2. Only poll protocol/position when wallet, contract, and backend are active
    useEffect(() => {
        if (state.wallet && state.contractAddress && state.health?.ready) {
            actions.refreshProtocol();
            actions.refreshPosition();

            const interval = setInterval(() => {
                actions.refreshProtocol();
                actions.refreshPosition();
            }, 20_000);
            return () => clearInterval(interval);
        }
    }, [state.wallet, state.contractAddress, state.health?.ready, actions]);

    const defaultRoute = state.wallet && state.contractAddress ? '/dashboard' : '/setup';

    return (
        <div className="app-layout">
            <CelestialBg />
            <Sidebar />
            <div className="main-container">
                <TopBar />
                <main className="content">
                    <Routes location={location}>
                        <Route path="/setup" element={<Setup />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/position" element={<Position />} />
                        <Route path="/actions" element={<Actions />} />
                        <Route path="/how-it-works" element={<HowItWorks />} />
                        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
                    </Routes>
                </main>
                <Footer />
            </div>
        </div>
    );
};

// ─── Root ─────────────────────────────────────────────────────────────────────

const App: React.FC = () => (
    <AppProvider>
        <BrowserRouter>
            <AppContent />
        </BrowserRouter>
    </AppProvider>
);

export default App;