import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { AppProvider, useApp } from './context.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Position } from './pages/Position.tsx';
import { Actions } from './pages/Actions.tsx';
import { Setup } from './pages/Setup.tsx';
import './index.css';

const NavBar: React.FC = () => {
    const { state } = useApp();
    const hasWallet = !!state.wallet;
    const hasContract = !!state.contractAddress;

    return (
        <nav className="navbar">
            <div className="navbar-brand">
                <span className="navbar-logo">◈</span>
                <span className="navbar-title">pUSD</span>
                <span className="navbar-subtitle">Lending Protocol</span>
            </div>
            <div className="navbar-links">
                <NavLink to="/setup" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                    Setup
                </NavLink>
                {hasWallet && hasContract && (
                    <>
                        <NavLink to="/dashboard" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            Dashboard
                        </NavLink>
                        <NavLink to="/position" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            My Position
                        </NavLink>
                        <NavLink to="/actions" className={({ isActive }) => isActive ? 'nav-link active' : 'nav-link'}>
                            Actions
                        </NavLink>
                    </>
                )}
            </div>
            <div className="navbar-status">
                {state.health && (
                    <span className="status-badge" data-network={state.health.network}>
                        {state.health.network}
                    </span>
                )}
                {hasWallet && <span className="status-dot connected" title="Wallet connected" />}
                {hasContract && <span className="status-dot contract" title="Contract active" />}
            </div>
        </nav>
    );
};

const AppContent: React.FC = () => {
    const { state, actions } = useApp();

    useEffect(() => {
        actions.checkHealth();
        const interval = setInterval(() => actions.checkHealth(), 15_000);
        return () => clearInterval(interval);
    }, [actions]);

    const defaultRoute = state.wallet && state.contractAddress ? '/dashboard' : '/setup';

    return (
        <BrowserRouter>
            <div className="app">
                <NavBar />
                <main className="main-content">
                    <Routes>
                        <Route path="/setup" element={<Setup />} />
                        <Route path="/dashboard" element={<Dashboard />} />
                        <Route path="/position" element={<Position />} />
                        <Route path="/actions" element={<Actions />} />
                        <Route path="*" element={<Navigate to={defaultRoute} replace />} />
                    </Routes>
                </main>
                <footer className="footer">
                    <span>pUSD Lending Protocol</span>
                    <span className="footer-sep">·</span>
                    <span>Built on Midnight Network</span>
                    <span className="footer-sep">·</span>
                    <span>Powered by Zero-Knowledge Proofs</span>
                </footer>
            </div>
        </BrowserRouter>
    );
};

const App: React.FC = () => (
    <AppProvider>
        <AppContent />
    </AppProvider>
);

export default App;
