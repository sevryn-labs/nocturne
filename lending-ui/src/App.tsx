import React, { useEffect, useRef, useState } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { AppProvider, useApp } from './context.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { Position } from './pages/Position.tsx';
import { Actions } from './pages/Actions.tsx';
import { Setup } from './pages/Setup.tsx';
import { HowItWorks } from './pages/HowItWorks.tsx';
import { Tooltip } from './components/UI.tsx';
import './index.css';

// ─── Moon Crescent ────────────────────────────────────────────────────────────

const MoonCrescent: React.FC<{ size?: number }> = ({ size = 22 }) => (
    <div
        style={{
            width: size, height: size, borderRadius: '50%', flexShrink: 0,
            boxShadow: `inset -${Math.round(size * 0.28)}px ${Math.round(size * 0.07)}px 0 0 var(--moon-silver),
                        0 0 ${size * 0.6}px rgba(200,214,232,0.15),
                        0 0 ${size * 1.2}px rgba(108,99,255,0.08)`,
            border: '1px solid rgba(200,214,232,0.13)',
        }}
    />
);

// ─── Starfield Canvas ─────────────────────────────────────────────────────────

const Starfield: React.FC = () => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d')!;

        const resize = () => { canvas.width = window.innerWidth; canvas.height = window.innerHeight; };
        resize();
        window.addEventListener('resize', resize);

        const STARS = Array.from({ length: 220 }, () => ({
            x: Math.random(), y: Math.random(),
            r: Math.random() * 1.1 + 0.2,
            o: Math.random() * 0.55 + 0.1,
            speed: Math.random() * 0.5 + 0.2,
            phase: Math.random() * Math.PI * 2,
        }));

        let t = 0, raf: number;
        const draw = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            STARS.forEach(s => {
                const twinkle = s.o * (0.6 + 0.4 * Math.sin(t * s.speed + s.phase));
                ctx.beginPath();
                ctx.arc(s.x * canvas.width, s.y * canvas.height, s.r, 0, Math.PI * 2);
                ctx.fillStyle = `rgba(200,214,232,${twinkle})`;
                ctx.fill();
            });
            t += 0.012;
            raf = requestAnimationFrame(draw);
        };
        draw();

        // Shooting star
        const shootStar = () => {
            const sx = Math.random() * canvas.width * 0.6;
            const sy = Math.random() * canvas.height * 0.28;
            const len = 110 + Math.random() * 70;
            const ang = Math.PI / 5.5;
            let p = 0;
            const animate = () => {
                p += 0.045;
                if (p > 1) { setTimeout(shootStar, 7000 + Math.random() * 9000); return; }
                const ex = sx + Math.cos(ang) * len * p;
                const ey = sy + Math.sin(ang) * len * p;
                const sx2 = sx + Math.cos(ang) * len * Math.max(0, p - 0.28);
                const sy2 = sy + Math.sin(ang) * len * Math.max(0, p - 0.28);
                const g = ctx.createLinearGradient(sx2, sy2, ex, ey);
                g.addColorStop(0, 'rgba(200,214,232,0)');
                g.addColorStop(1, `rgba(200,214,232,${0.85 * Math.sin(p * Math.PI)})`);
                ctx.beginPath(); ctx.moveTo(sx2, sy2); ctx.lineTo(ex, ey);
                ctx.strokeStyle = g; ctx.lineWidth = 1.4; ctx.stroke();
                requestAnimationFrame(animate);
            };
            animate();
        };
        setTimeout(shootStar, 2500);

        return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
    }, []);

    return <canvas ref={canvasRef} style={{ position: 'fixed', inset: 0, zIndex: 0, pointerEvents: 'none' }} />;
};

// ─── Landing sub-components ───────────────────────────────────────────────────

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '18px' }}>
        <div style={{ width: '24px', height: '1px', background: 'var(--text-muted)' }} />
        {children}
    </div>
);

const LandingCard: React.FC<{ children: React.ReactNode; style?: React.CSSProperties }> = ({ children, style }) => (
    <div
        style={{ padding: '28px', background: 'var(--bg-secondary)', border: '1px solid rgba(200,214,232,0.07)', borderRadius: '18px', position: 'relative', overflow: 'hidden', transition: 'border-color 0.3s, transform 0.3s', ...style }}
        onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(200,214,232,0.14)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(200,214,232,0.07)'; (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; }}
    >
        <div style={{ position: 'absolute', top: 0, left: '12%', right: '12%', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(200,214,232,0.1), transparent)', pointerEvents: 'none' }} />
        {children}
    </div>
);

const ZKRow: React.FC<{ type: 'private' | 'public'; label: string; sublabel: string }> = ({ type, label, sublabel }) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', background: type === 'private' ? 'rgba(108,99,255,0.07)' : 'rgba(0,229,255,0.05)', border: `1px solid ${type === 'private' ? 'rgba(108,99,255,0.18)' : 'rgba(0,229,255,0.15)'}` }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: type === 'private' ? 'var(--accent-primary)' : 'var(--accent-secondary)', boxShadow: `0 0 6px ${type === 'private' ? 'var(--accent-primary)' : 'var(--accent-secondary)'}` }} />
        <div>
            <div style={{ fontSize: '12px', fontWeight: 600, color: type === 'private' ? '#8B85FF' : 'var(--accent-secondary)', marginBottom: '2px' }}>{label}</div>
            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{sublabel}</div>
        </div>
    </div>
);

const Tag: React.FC<{ type: 'revealed' | 'hidden' | 'none'; children: React.ReactNode }> = ({ type, children }) => {
    const s: Record<string, React.CSSProperties> = {
        revealed: { background: 'rgba(255,92,92,0.1)', border: '1px solid rgba(255,92,92,0.22)', color: 'var(--status-error)' },
        hidden: { background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.22)', color: '#8B85FF' },
        none: { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', color: 'var(--text-muted)', fontWeight: 400 },
    };
    return <span style={{ padding: '3px 8px', borderRadius: '6px', fontSize: '11px', fontWeight: 600, fontFamily: 'monospace', ...s[type] }}>{children}</span>;
};

// ─── Landing Page ─────────────────────────────────────────────────────────────

const Landing: React.FC = () => {
    const { state } = useApp();
    const navigate = useNavigate();
    const [visible, setVisible] = useState(false);
    useEffect(() => { const t = setTimeout(() => setVisible(true), 60); return () => clearTimeout(t); }, []);

    const handleLaunch = () => navigate(state.wallet && state.contractAddress ? '/dashboard' : '/setup');

    const fade = (delay = 0): React.CSSProperties => ({
        opacity: visible ? 1 : 0,
        transform: visible ? 'translateY(0)' : 'translateY(28px)',
        transition: `opacity 0.75s ease ${delay}s, transform 0.75s ease ${delay}s`,
    });

    const DISCLOSURE_ROWS = [
        { circuit: 'depositCollateral', revealed: ['amount'], hidden: ['collateral'], constraint: 'amount > 0' },
        { circuit: 'mintPUSD', revealed: ['amount'], hidden: ['collateral', 'debt'], constraint: 'C × 100 ≥ D′ × 150' },
        { circuit: 'repayPUSD', revealed: ['amount'], hidden: ['debt'], constraint: 'debtAmount ≥ amount' },
        { circuit: 'withdrawCollateral', revealed: ['amount'], hidden: ['collateral', 'debt'], constraint: 'C′ × 100 ≥ D × 150' },
        { circuit: 'liquidate', revealed: ['victimCollateral', 'victimDebt'], hidden: [], constraint: 'Vc × 100 < Vd × 150' },
    ];

    const LIMITS = [
        { title: 'No Price Oracle', body: 'Collateral is valued at nominal integer quantity with no exchange rate to external assets.' },
        { title: 'No Interest Accrual', body: 'Effective interest rate is 0%. Debt stays constant until explicitly repaid or liquidated.' },
        { title: 'No Partial Liquidation', body: 'The liquidate circuit consumes the entire reported position. No fractional liquidations.' },
        { title: 'No Governance', body: 'liquidationRatio and mintingRatio are immutable post-deployment. No admin key or upgrade path.' },
        { title: 'Private State Staleness', body: 'Liquidated positions are not auto-invalidated in local LevelDB. Stale witness values may persist.' },
        { title: 'No Contract-to-Contract', body: 'Midnight does not yet support C2C calls. pUSD transfers are restricted to wallet addresses.' },
    ];

    return (
        <div style={{ position: 'relative', overflowX: 'hidden', background: 'var(--bg-primary)' }}>
            <Starfield />

            {/* ── NAV ─────────────────────────────────────────────── */}
            <nav style={{ position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100, padding: '18px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(7,10,20,0.75)', backdropFilter: 'blur(20px)', borderBottom: '1px solid rgba(200,214,232,0.06)', ...fade(0) }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <MoonCrescent size={26} />
                    <span style={{ fontFamily: 'var(--font-heading)', fontWeight: 700, fontSize: '17px', letterSpacing: '-0.03em' }}>pUSD Protocol</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '28px' }}>
                    {[['#how', 'How It Works'], ['#circuits', 'Circuits'], ['#privacy', 'Privacy']].map(([href, label]) => (
                        <a key={href} href={href} style={{ color: 'var(--text-secondary)', fontSize: '14px', fontWeight: 500, textDecoration: 'none', transition: 'color 0.2s' }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}>
                            {label}
                        </a>
                    ))}
                    <button onClick={handleLaunch} className="btn btn-primary" style={{ padding: '9px 22px', fontSize: '14px' }}>
                        Launch App →
                    </button>
                </div>
            </nav>

            {/* ── HERO ────────────────────────────────────────────── */}
            <section style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '140px 32px 80px', position: 'relative', zIndex: 1 }}>
                {/* Decorative large crescent */}
                <div style={{ position: 'absolute', top: '60px', right: '-60px', width: '420px', height: '420px', borderRadius: '50%', boxShadow: 'inset -80px 16px 0 0 rgba(200,214,232,0.05), 0 0 200px rgba(108,99,255,0.05)', border: '1px solid rgba(200,214,232,0.04)', pointerEvents: 'none' }} />

                <div style={{ ...fade(0.05), display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '5px 16px', borderRadius: '20px', marginBottom: '28px', background: 'rgba(200,214,232,0.05)', border: '1px solid rgba(200,214,232,0.12)', fontSize: '11px', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: 'var(--moon-silver)' }}>
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: 'var(--moon-silver)', boxShadow: '0 0 6px var(--moon-silver)' }} />
                    Live on Midnight Testnet: v1.0
                </div>

                <h1 style={{ ...fade(0.12), fontFamily: 'var(--font-heading)', fontSize: 'clamp(52px, 8.5vw, 96px)', fontWeight: 800, lineHeight: 0.95, letterSpacing: '-0.04em', marginBottom: '28px' }}>
                    <span style={{ display: 'block', color: 'var(--text-primary)' }}>Borrow in the dark.</span>
                    <span style={{ display: 'block', background: 'linear-gradient(120deg, var(--moon-silver) 0%, #E6EAF2 40%, var(--accent-secondary) 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}>Prove you're solvent.</span>
                    <span style={{ display: 'block', color: 'var(--text-secondary)', fontWeight: 400, fontSize: '0.52em', letterSpacing: '-0.01em', marginTop: '10px' }}>Reveal nothing else.</span>
                </h1>

                <p style={{ ...fade(0.2), maxWidth: '540px', fontSize: '17px', color: 'var(--text-secondary)', lineHeight: 1.7, margin: '0 auto 44px' }}>
                    A <strong style={{ color: 'var(--text-primary)', fontWeight: 500 }}>privacy-preserving collateralised debt protocol</strong> on the Midnight Network.
                    Deposit tNight, mint pUSD, and let zero-knowledge proofs enforce every constraint: without exposing your position to anyone.
                </p>

                <div style={{ ...fade(0.28), display: 'flex', gap: '14px', justifyContent: 'center', flexWrap: 'wrap' }}>
                    <button onClick={handleLaunch} className="btn btn-primary" style={{ padding: '14px 36px', fontSize: '16px' }}>
                        {state.wallet && state.contractAddress ? 'Go to Dashboard →' : 'Get Started →'}
                    </button>
                    <a href="#how" className="btn btn-ghost" style={{ padding: '14px 28px', fontSize: '15px' }}>How it works ↓</a>
                </div>

                {/* Stats strip */}
                <div style={{ ...fade(0.36), display: 'flex', gap: '48px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '80px', paddingTop: '48px', borderTop: '1px solid rgba(200,214,232,0.07)' }}>
                    {[
                        { val: '150%', label: 'Min Collateral Ratio', color: 'var(--moon-silver)' },
                        { val: '8', label: 'ZK Circuits', color: '#8B85FF' },
                        { val: '0%', label: 'Interest Rate', color: 'var(--accent-secondary)' },
                        { val: '0', label: 'Admin Keys', color: 'var(--moon-silver)' },
                        { val: '30', label: 'Passing Tests', color: '#8B85FF' },
                    ].map(s => (
                        <div key={s.label} style={{ textAlign: 'center' }}>
                            <div style={{ fontFamily: 'var(--font-heading)', fontSize: '34px', fontWeight: 800, letterSpacing: '-0.04em', color: s.color, lineHeight: 1 }}>{s.val}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px', letterSpacing: '0.04em' }}>{s.label}</div>
                        </div>
                    ))}
                </div>
            </section>

            {/* ── HOW IT WORKS ────────────────────────────────────── */}
            <section id="how" style={{ padding: '120px 0', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 32px' }}>
                    <SectionLabel>Protocol Mechanics</SectionLabel>
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: '14px' }}>Private debt,<br />public solvency.</h2>
                    <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '440px', lineHeight: 1.7, marginBottom: '56px' }}>Every position is provably solvent without ever disclosing a balance to the ledger.</p>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                        {[
                            { n: '01', icon: '🌑', iconBg: 'rgba(200,214,232,0.07)', iconBorder: 'rgba(200,214,232,0.15)', title: 'Lock tNight as Collateral', body: 'Deposit Midnight testnet tokens. Your collateral balance is stored exclusively in client-side LevelDB: never published to the ledger.' },
                            { n: '02', icon: '❦', iconBg: 'rgba(0,229,255,0.07)', iconBorder: 'rgba(0,229,255,0.18)', title: 'Mint pUSD: A Real Token', body: 'Generate pUSD tokens against your collateral. A ZK proof certifies your ratio ≥ 150% without revealing how much tNight you hold. pUSD is fully transferable.' },
                            { n: '03', icon: '↺', iconBg: 'rgba(108,99,255,0.07)', iconBorder: 'rgba(108,99,255,0.2)', title: 'Repay & Withdraw Freely', body: 'Repay debt and reclaim collateral at any time. Every operation enforces safety constraints in-circuit: no trusted intermediary.' },
                            { n: '04', icon: '⚡', iconBg: 'rgba(255,92,92,0.07)', iconBorder: 'rgba(255,92,92,0.18)', title: 'Permissionless Liquidation', body: 'Anyone can liquidate a position whose ratio drops below 150%. Exactly 150% is protected: the circuit uses strict inequality.' },
                        ].map(c => (
                            <LandingCard key={c.n}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '18px' }}>
                                    <div style={{ width: '44px', height: '44px', borderRadius: '12px', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', background: c.iconBg, border: `1px solid ${c.iconBorder}` }}>{c.icon}</div>
                                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>{c.n}</span>
                                </div>
                                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '10px' }}>{c.title}</h3>
                                <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.7 }}>{c.body}</p>
                            </LandingCard>
                        ))}
                    </div>

                    {/* ZK featured card */}
                    <div style={{ marginTop: '20px' }}>
                        <LandingCard>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '48px', alignItems: 'center' }}>
                                <div>
                                    <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>05: PRIVACY MODEL</span>
                                    <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '22px', fontWeight: 700, letterSpacing: '-0.02em', margin: '14px 0 12px' }}>Zero-Knowledge by Design</h3>
                                    <p style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1.7, marginBottom: '12px' }}>pUSD separates <em>proof of solvency</em> from <em>disclosure of position</em>. Your individual collateral and debt balances are ZK-proven witness values that never appear on the public ledger.</p>
                                    <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.7, opacity: 0.7 }}>Unlike MakerDAO, Aave, or Compound: where every borrow is fully visible: pUSD makes your financial position unconditionally private while keeping aggregate protocol solvency publicly auditable.</p>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>What's visible vs. hidden</div>
                                    <ZKRow type="private" label="ZK-Proven Private" sublabel="Your collateral · Your debt · Your wallet" />
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                                        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(108,99,255,0.3))' }} />
                                        <div style={{ padding: '4px 12px', borderRadius: '20px', background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.3)', fontSize: '11px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>ZK Proof</div>
                                        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, rgba(0,229,255,0.25), transparent)' }} />
                                    </div>
                                    <ZKRow type="public" label="Publicly Auditable" sublabel="Total collateral · Total debt · Ratios" />
                                    <div style={{ marginTop: '8px', padding: '14px', borderRadius: '10px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                                        Proofs are generated locally. The proof server (Docker, port 6300) is stateless and receives only circuit inputs: never your raw private state.
                                    </div>
                                </div>
                            </div>
                        </LandingCard>
                    </div>
                </div>
            </section>

            {/* ── CIRCUITS ────────────────────────────────────────── */}
            <section id="circuits" style={{ padding: '120px 0', background: 'var(--bg-secondary)', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 32px' }}>
                    <SectionLabel>Compact ZK Circuits</SectionLabel>
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: '14px' }}>Five circuits.<br />Every operation covered.</h2>
                    <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '440px', lineHeight: 1.7, marginBottom: '56px' }}>All protocol logic compiles to verifiable ZK circuits. No runtime trust: only cryptographic proof.</p>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '14px', marginBottom: '64px' }}>
                        {[
                            { name: 'depositCollateral', label: 'Deposit', icon: '🌑', color: 'var(--moon-silver)', bg: 'rgba(200,214,232,0.06)', border: 'rgba(200,214,232,0.15)' },
                            { name: 'mintPUSD', label: 'Mint', icon: '✦', color: 'var(--accent-secondary)', bg: 'rgba(0,229,255,0.06)', border: 'rgba(0,229,255,0.18)' },
                            { name: 'repayPUSD', label: 'Repay', icon: '↺', color: '#8B85FF', bg: 'rgba(108,99,255,0.07)', border: 'rgba(108,99,255,0.2)' },
                            { name: 'withdrawCollateral', label: 'Withdraw', icon: '↑', color: 'var(--status-warning)', bg: 'rgba(255,184,77,0.07)', border: 'rgba(255,184,77,0.2)' },
                            { name: 'liquidate', label: 'Liquidate', icon: '⚡', color: 'var(--status-error)', bg: 'rgba(255,92,92,0.07)', border: 'rgba(255,92,92,0.18)' },
                        ].map(c => (
                            <div key={c.name} style={{ padding: '22px 16px', textAlign: 'center', borderRadius: '16px', background: 'var(--bg-primary)', border: `1px solid ${c.border}`, transition: 'transform 0.2s' }}
                                onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
                                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}>
                                <div style={{ width: '44px', height: '44px', borderRadius: '12px', margin: '0 auto 14px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px', background: c.bg, border: `1px solid ${c.border}` }}>{c.icon}</div>
                                <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-muted)', marginBottom: '6px' }}>{c.name}</div>
                                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '13px', fontWeight: 700, color: c.color }}>{c.label}</div>
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: '18px' }}>
                        {[
                            { n: 'INVARIANT 01', icon: '🔒', title: 'No Undercollateralised Minting', body: 'The mintPUSD circuit enforces that new debt cannot push your ratio below 150%: enforced in zero knowledge, cannot be bypassed.', formula: 'C × 100 ≥ D′ × 150' },
                            { n: 'INVARIANT 02', icon: '◎', title: 'No Over-Withdrawal', body: 'Withdrawing collateral is only permitted if the remaining ratio still clears 150%. Branchless design reveals nothing about debt status.', formula: 'C′ × 100 ≥ D × 150' },
                            { n: 'INVARIANT 03', icon: '⚡', title: 'Strict Liquidation Threshold', body: 'Positions at exactly 150% are explicitly protected. Only strict undercollateralisation triggers the circuit.', formula: 'Vc × 100 < Vd × 150' },
                        ].map(g => (
                            <LandingCard key={g.n}>
                                <div style={{ fontFamily: 'monospace', fontSize: '10px', color: 'var(--text-muted)', letterSpacing: '0.08em', marginBottom: '14px' }}>{g.n}</div>
                                <span style={{ fontSize: '22px', display: 'block', marginBottom: '12px' }}>{g.icon}</span>
                                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '15px', fontWeight: 700, letterSpacing: '-0.02em', marginBottom: '10px' }}>{g.title}</h3>
                                <p style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.65, marginBottom: '14px' }}>{g.body}</p>
                                <div style={{ padding: '9px 12px', borderRadius: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)', fontFamily: 'monospace', fontSize: '12px', color: 'var(--moon-silver)' }}>{g.formula}</div>
                            </LandingCard>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── PRIVACY TABLE ────────────────────────────────────── */}
            <section id="privacy" style={{ padding: '120px 0', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 32px' }}>
                    <SectionLabel>Privacy Model</SectionLabel>
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: '14px' }}>What gets revealed,<br />circuit by circuit.</h2>
                    <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '480px', lineHeight: 1.7, marginBottom: '56px' }}>
                        The <code style={{ fontFamily: 'monospace', fontSize: '14px', color: 'var(--moon-silver)' }}>disclose()</code> annotation in Compact enforces exactly what may appear on-chain. Everything else is ZK-proven.
                    </p>
                    <div style={{ borderRadius: '18px', overflow: 'hidden', border: '1px solid rgba(200,214,232,0.07)' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', padding: '13px 24px', background: 'rgba(255,255,255,0.02)', borderBottom: '1px solid rgba(200,214,232,0.07)' }}>
                            {['Circuit', 'Revealed On-Chain', 'ZK-Proven (Hidden)', 'Key Constraint'].map(h => (
                                <span key={h} style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>{h}</span>
                            ))}
                        </div>
                        {DISCLOSURE_ROWS.map((row, i) => (
                            <div key={row.circuit} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 1fr', padding: '18px 24px', borderBottom: i < DISCLOSURE_ROWS.length - 1 ? '1px solid rgba(200,214,232,0.05)' : 'none', alignItems: 'center', transition: 'background 0.15s' }}
                                onMouseEnter={e => (e.currentTarget.style.background = 'rgba(255,255,255,0.02)')}
                                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                                <span style={{ fontFamily: 'monospace', fontSize: '13px', color: 'var(--text-primary)' }}>{row.circuit}</span>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{row.revealed.map(v => <Tag key={v} type="revealed">{v}</Tag>)}</div>
                                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>{row.hidden.length ? row.hidden.map(v => <Tag key={v} type="hidden">{v}</Tag>) : <Tag type="none">none</Tag>}</div>
                                <span style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--moon-silver)', opacity: 0.7 }}>{row.constraint}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── LIMITATIONS ─────────────────────────────────────── */}
            <section style={{ padding: '120px 0', background: 'var(--bg-secondary)', position: 'relative', zIndex: 1 }}>
                <div style={{ maxWidth: '1120px', margin: '0 auto', padding: '0 32px' }}>
                    <SectionLabel>Honest Limitations</SectionLabel>
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(32px,5vw,52px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.05, marginBottom: '14px' }}>What this protocol<br />does not do.</h2>
                    <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '440px', lineHeight: 1.7, marginBottom: '56px' }}>pUSD is a minimal viable implementation. These are the known constraints of v1.0: all by design.</p>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {LIMITS.map(l => (
                            <div key={l.title} style={{ display: 'flex', gap: '14px', alignItems: 'flex-start', padding: '22px 24px', borderRadius: '14px', border: '1px solid rgba(200,214,232,0.06)', background: 'var(--bg-primary)' }}>
                                <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--status-warning)', boxShadow: '0 0 8px var(--status-warning)', flexShrink: 0, marginTop: '6px' }} />
                                <div>
                                    <div style={{ fontFamily: 'var(--font-heading)', fontSize: '14px', fontWeight: 700, marginBottom: '6px' }}>{l.title}</div>
                                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{l.body}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* ── CTA ─────────────────────────────────────────────── */}
            <section style={{ padding: '160px 0', textAlign: 'center', position: 'relative', zIndex: 1 }}>
                <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: '600px', height: '400px', background: 'radial-gradient(ellipse, rgba(108,99,255,0.09), transparent 65%)', pointerEvents: 'none' }} />
                <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{ width: '72px', height: '72px', borderRadius: '50%', margin: '0 auto 28px', boxShadow: 'inset -20px 4px 0 0 rgba(200,214,232,0.5), 0 0 60px rgba(200,214,232,0.1), 0 0 100px rgba(108,99,255,0.07)', border: '1px solid rgba(200,214,232,0.14)' }} />
                    <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: 'clamp(40px,6vw,68px)', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1, marginBottom: '18px' }}>Ready to lend<br />in the dark?</h2>
                    <p style={{ fontSize: '16px', color: 'var(--text-secondary)', maxWidth: '420px', margin: '0 auto 44px', lineHeight: 1.7 }}>Connect a Midnight wallet, deploy or join a contract instance, and start borrowing with full ZK privacy.</p>
                    <div style={{ display: 'flex', gap: '14px', justifyContent: 'center' }}>
                        <button onClick={handleLaunch} className="btn btn-primary" style={{ padding: '16px 48px', fontSize: '17px' }}>
                            {state.wallet && state.contractAddress ? 'Go to Dashboard →' : 'Start Setup →'}
                        </button>
                        <a href="/pUSD_Whitepaper_v2.pdf" target="_blank" rel="noreferrer" className="btn btn-ghost" style={{ padding: '16px 32px', fontSize: '16px' }}>Read Whitepaper</a>
                    </div>
                    <div style={{ marginTop: '28px', fontSize: '12px', color: 'var(--text-muted)', opacity: 0.5 }}>Early-stage educational implementation · Not for production use with real assets</div>
                </div>
            </section>

            {/* ── LANDING FOOTER ──────────────────────────────────── */}
            <footer style={{ borderTop: '1px solid rgba(200,214,232,0.06)', padding: '24px 40px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'relative', zIndex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '24px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <MoonCrescent size={18} />
                        <span style={{ fontFamily: 'var(--font-heading)', fontSize: '14px', fontWeight: 700 }}>pUSD Protocol</span>
                    </div>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Built on Midnight Network · v1.0 · February 2026</span>
                </div>
                <span style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.28, letterSpacing: '0.3em' }}>✦ ✦ ✦</span>
            </footer>
        </div>
    );
};

// ─── Nav icons ────────────────────────────────────────────────────────────────

const NAV_ICONS: Record<string, string> = {
    setup: '⚙', dashboard: '▦', position: '◎', actions: '⇆', howItWorks: '◈',
};

// ─── Sidebar ──────────────────────────────────────────────────────────────────

const Sidebar: React.FC = () => {
    const { state } = useApp();
    const hasWallet = !!state.wallet;
    const hasContract = !!state.contractAddress;
    const totalCollateral = state.protocol ? BigInt(state.protocol.totalCollateral).toLocaleString() : '0';
    const totalDebt = state.protocol ? BigInt(state.protocol.totalDebt).toLocaleString() : '0';
    const totalSupply = state.protocol?.totalSupply ? BigInt(state.protocol.totalSupply).toLocaleString() : totalDebt;

    return (
        <aside className="sidebar">
            <div className="sidebar-logo">
                <MoonCrescent size={30} />
                <span className="logo-text">pUSD Lending</span>
            </div>
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
            <div className="nav-text" style={{ padding: '20px 24px', borderTop: '1px solid rgba(200,214,232,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Protocol Stats</span>
                    <div style={{ flex: 1, height: '1px', background: 'rgba(200,214,232,0.06)' }} />
                    <span style={{ color: 'var(--moon-silver)', fontSize: '8px', opacity: 0.5 }}>✦</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Collateral</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{totalCollateral} tN</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Debt</span>
                        <span style={{ fontSize: '12px', color: 'var(--text-secondary)', fontFamily: 'monospace' }}>{totalDebt} pUSD</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Token Supply</span>
                        <span style={{ fontSize: '12px', color: 'var(--accent-secondary)', fontFamily: 'monospace' }}>{totalSupply} pUSD</span>
                    </div>
                    <div style={{ fontSize: '10px', color: 'var(--text-muted)', opacity: 0.5, textAlign: 'right', fontFamily: 'monospace' }}>supply == debt ✓</div>
                </div>
            </div>
        </aside>
    );
};

// ─── TopBar ───────────────────────────────────────────────────────────────────

const StatusDot: React.FC<{ connected: boolean; title: string }> = ({ connected, title }) => (
    <div title={title} style={{ width: '8px', height: '8px', borderRadius: '50%', background: connected ? 'var(--status-success)' : 'var(--status-error)', boxShadow: connected ? '0 0 6px rgba(76,175,80,0.5)' : '0 0 6px rgba(255,92,92,0.4)', transition: 'background 0.3s ease, box-shadow 0.3s ease' }} />
);

const TopBar: React.FC = () => {
    const { state } = useApp();
    const shortenAddress = (addr: string) => addr ? `${addr.slice(0, 8)}…${addr.slice(-6)}` : 'Not Connected';

    return (
        <header className="topbar">
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                {state.health ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '5px 12px', borderRadius: '20px', background: 'rgba(200,214,232,0.05)', border: '1px solid rgba(200,214,232,0.1)', fontSize: '12px', fontWeight: 600, color: 'var(--moon-silver)', letterSpacing: '0.04em' }}>
                        <span style={{ position: 'relative', display: 'inline-block', width: '7px', height: '7px' }}>
                            <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--status-success)', animation: 'pulse-ring 2s ease-out infinite' }} />
                            <span style={{ position: 'absolute', inset: '1px', borderRadius: '50%', background: 'var(--status-success)' }} />
                        </span>
                        {state.health.network}
                    </div>
                ) : (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '7px', padding: '5px 12px', borderRadius: '20px', background: 'rgba(255,92,92,0.07)', border: '1px solid rgba(255,92,92,0.18)', fontSize: '12px', fontWeight: 600, color: 'var(--status-error)' }}>
                        <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: 'var(--status-error)', display: 'inline-block' }} />
                        Disconnected
                    </div>
                )}
            </div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                {state.wallet && (
                    <div className="glass-panel" style={{ padding: '7px 14px', borderRadius: '12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <Tooltip label="DUST" content="Midnight network resource used to pay for private transaction proofs." />
                        <span style={{ fontWeight: 600, color: 'var(--text-primary)', marginLeft: '4px' }}>{state.wallet.dustBalance}</span>
                    </div>
                )}
                <div className="glass-panel" style={{ padding: '7px 14px', borderRadius: '12px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Tooltip label="Contract" content="The active smart contract instance managing the lending protocol." />
                    <span style={{ color: 'var(--accent-secondary)', fontWeight: 600, fontFamily: 'monospace', marginLeft: '4px' }}>
                        {state.contractAddress ? shortenAddress(state.contractAddress) : 'No Contract'}
                    </span>
                </div>
                <div style={{ display: 'flex', gap: '6px', alignItems: 'center', padding: '7px 12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)', borderRadius: '12px' }}>
                    <StatusDot connected={!!state.health} title="Network Health" />
                    <StatusDot connected={!!state.wallet} title="Wallet Status" />
                </div>
            </div>
            <style>{`@keyframes pulse-ring { 0% { opacity:.6; transform:scale(1); } 70% { opacity:0; transform:scale(2.2); } 100% { opacity:0; transform:scale(2.2); } }`}</style>
        </header>
    );
};

// ─── App footer ───────────────────────────────────────────────────────────────

const AppFooter: React.FC = () => (
    <footer style={{ borderTop: '1px solid rgba(200,214,232,0.06)', padding: '16px 32px', display: 'flex', alignItems: 'center', gap: '12px', fontSize: '12px', color: 'var(--text-muted)' }}>
        <MoonCrescent size={14} />
        <span>pUSD Lending Protocol</span>
        <span style={{ color: 'rgba(200,214,232,0.15)' }}>·</span>
        <span>Built on Midnight Network</span>
        <span style={{ color: 'rgba(200,214,232,0.15)' }}>·</span>
        <span>Powered by ZK Proofs</span>
        <span style={{ marginLeft: 'auto', letterSpacing: '0.2em', opacity: 0.28, fontSize: '10px' }}>✦ ✦ ✦</span>
    </footer>
);

// ─── Celestial background (app shell) ────────────────────────────────────────

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

const CelestialBg: React.FC = () => (
    <div className="app-bg">
        <div className="moon-decoration" />
        <div className="shooting-star" />
        {TWINKLE_STARS.map((s, i) => (
            <span key={i} className="star" style={{ left: s.x, top: s.y, width: s.size, height: s.size, '--twinkle-duration': s.duration, '--twinkle-delay': s.delay, '--twinkle-opacity': s.opacity } as React.CSSProperties} />
        ))}
    </div>
);

// ─── App shell (sidebar + topbar) ────────────────────────────────────────────

const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <div className="app-layout">
        <CelestialBg />
        <Sidebar />
        <div className="main-container">
            <TopBar />
            <main className="content">{children}</main>
            <AppFooter />
        </div>
    </div>
);

// ─── AppContent ───────────────────────────────────────────────────────────────

const AppContent: React.FC = () => {
    const { state, actions } = useApp();
    const location = useLocation();

    // Poll network health every 15s
    useEffect(() => {
        actions.checkHealth();
        const interval = setInterval(() => actions.checkHealth(), 15_000);
        return () => clearInterval(interval);
    }, [actions]);

    // Poll protocol/position every 20s when wallet+contract are active
    useEffect(() => {
        if (state.wallet && state.contractAddress) {
            actions.refreshProtocol();
            actions.refreshPosition();
            const interval = setInterval(() => { actions.refreshProtocol(); actions.refreshPosition(); }, 20_000);
            return () => clearInterval(interval);
        }
    }, [state.wallet, state.contractAddress, actions]);

    return (
        <Routes location={location}>
            {/* "/": full-page landing, no sidebar */}
            <Route path="/" element={<Landing />} />

            {/* App routes: wrapped in sidebar/topbar shell */}
            <Route path="/setup" element={<AppShell><Setup /></AppShell>} />
            <Route path="/dashboard" element={<AppShell><Dashboard /></AppShell>} />
            <Route path="/position" element={<AppShell><Position /></AppShell>} />
            <Route path="/actions" element={<AppShell><Actions /></AppShell>} />
            <Route path="/how-it-works" element={<AppShell><HowItWorks /></AppShell>} />

            {/* Unknown paths → landing */}
            <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
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