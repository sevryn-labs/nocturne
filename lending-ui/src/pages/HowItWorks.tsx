import React, { useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

type StepKey = 'pusd' | 'collateral' | 'liquidation' | 'privacy';

const STEPS: { key: StepKey; n: string; title: string }[] = [
  { key: 'pusd', n: '01', title: 'What is pUSD?' },
  { key: 'collateral', n: '02', title: 'Collateral & Debt' },
  { key: 'liquidation', n: '03', title: 'Liquidation' },
  { key: 'privacy', n: '04', title: 'Privacy & ZK Proofs' },
];

const PRIVACY_ITEMS = {
  private: ['Individual Collateral', 'Individual Debt', 'Wallet Addresses'],
  public: ['Total Protocol Collateral', 'Total Protocol Debt', 'Liquidation Ratios'],
};

// ─── Crescent ─────────────────────────────────────────────────────────────────

const Crescent: React.FC<{ size?: number }> = ({ size = 18 }) => (
  <div style={{
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    boxShadow: `inset -${Math.round(size * 0.28)}px ${Math.round(size * 0.06)}px 0 0 var(--moon-silver), 0 0 ${size * 0.7}px rgba(200,214,232,0.15)`,
    border: '1px solid rgba(200,214,232,0.12)',
  }} />
);

// ─── Tab nav ──────────────────────────────────────────────────────────────────

const StepNav: React.FC<{ active: StepKey; onSelect: (k: StepKey) => void }> = ({ active, onSelect }) => (
  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '32px' }}>
    {STEPS.map(s => {
      const on = s.key === active;
      return (
        <button key={s.key} onClick={() => onSelect(s.key)} style={{
          display: 'flex', alignItems: 'center', gap: '8px',
          padding: '8px 16px', borderRadius: '20px', cursor: 'pointer',
          fontFamily: 'inherit', fontSize: '13px', fontWeight: 600,
          border: on ? '1px solid rgba(108,99,255,0.45)' : '1px solid rgba(255,255,255,0.07)',
          background: on ? 'rgba(108,99,255,0.12)' : 'rgba(255,255,255,0.03)',
          color: on ? 'var(--accent-primary)' : 'var(--text-muted)',
          transition: 'all 0.2s ease',
        }}>
          <span style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.05em', opacity: on ? 1 : 0.6 }}>{s.n}</span>
          {s.title}
        </button>
      );
    })}
  </div>
);

// ─── Shared atoms ─────────────────────────────────────────────────────────────

const InfoChip: React.FC<{ icon: string; title: string; body: string }> = ({ icon, title, body }) => (
  <div style={{ display: 'flex', gap: '14px', padding: '16px', borderRadius: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', alignItems: 'flex-start' }}>
    <span style={{ fontSize: '18px', lineHeight: 1, flexShrink: 0, marginTop: '1px' }}>{icon}</span>
    <div>
      <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '4px' }}>{title}</div>
      <div style={{ fontSize: '12px', color: 'var(--text-muted)', lineHeight: 1.6 }}>{body}</div>
    </div>
  </div>
);

const Token: React.FC<{ label: string; color: string; glow: string; sub: string }> = ({ label, color, glow, sub }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '6px' }}>
    <div style={{ width: '68px', height: '68px', borderRadius: '18px', background: glow, border: `1px solid ${color}40`, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: `0 0 24px ${glow}`, fontSize: '13px', fontWeight: 700, color }}>
      {label}
    </div>
    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{sub}</span>
  </div>
);

const FlowArrow: React.FC<{ label: string }> = ({ label }) => (
  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '4px 0' }}>
    <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.08)' }} />
    <span style={{ fontSize: '10px', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{label}</span>
    <span style={{ fontSize: '14px', color: 'var(--text-muted)', lineHeight: 1 }}>↓</span>
  </div>
);

const StateBadge: React.FC<{ color: string; bg: string; border: string; label: string; range: string; desc: string }> = ({ color, bg, border, label, range, desc }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '12px 16px', borderRadius: '12px', background: bg, border: `1px solid ${border}` }}>
    <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: color, boxShadow: `0 0 6px ${color}`, flexShrink: 0 }} />
    <div style={{ flex: 1 }}>
      <span style={{ fontSize: '13px', fontWeight: 700, color }}>{label}</span>
      <span style={{ fontSize: '12px', color: 'var(--text-muted)', marginLeft: '8px' }}>{range}</span>
    </div>
    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{desc}</span>
  </div>
);

// ─── Section 01: pUSD ────────────────────────────────────────────────────────

const PUSDSection: React.FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
    <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-40px', left: '50%', transform: 'translateX(-50%)', width: '200px', height: '150px', background: 'radial-gradient(ellipse, rgba(108,99,255,0.12), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px', position: 'relative', zIndex: 1 }}>
        <Token label="tNight" color="var(--moon-silver)" glow="rgba(200,214,232,0.15)" sub="Collateral" />
        <FlowArrow label="Locked in contract" />
        <div style={{ padding: '10px 16px', display: 'flex', alignItems: 'center', gap: '8px', background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.07)', borderRadius: '10px' }}>
          <span style={{ fontSize: '16px' }}>⛓</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Smart Contract</span>
        </div>
        <FlowArrow label="Mints against" />
        <Token label="pUSD" color="var(--accent-secondary)" glow="rgba(0,229,255,0.15)" sub="Synthetic Credit" />
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <InfoChip icon="◎" title="Synthetic Unit" body="pUSD is an internal accounting mechanism: not a transferable token on the public chain." />
      <InfoChip icon="🔒" title="Overcollateralised" body="Every pUSD is backed by ≥ 150% of its value in locked tNight collateral." />
      <InfoChip icon="⛓" title="On-Chain Settlement" body="All positions are enforced by a Midnight Network smart contract with no admin keys." />
    </div>
  </div>
);

// ─── Section 02: Collateral ───────────────────────────────────────────────────

const CollateralSection: React.FC = () => {
  const [collateral, setCollateral] = useState(300);
  const debt = 100;
  const ratio = Math.round((collateral / debt) * 100);
  const safe = ratio >= 150;

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '20px' }}>
          Live Calculator
        </div>
        <div style={{ marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Collateral (tN)</span>
            <span style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>{collateral}</span>
          </div>
          <input type="range" min={100} max={600} value={collateral} onChange={e => setCollateral(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent-primary)', cursor: 'pointer' }} />
        </div>
        <div style={{ marginBottom: '24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
            <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>Debt (pUSD)</span>
            <span style={{ fontSize: '13px', fontFamily: 'monospace', color: 'var(--text-primary)' }}>{debt}</span>
          </div>
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.06)', borderRadius: '3px' }}>
            <div style={{ width: '33%', height: '100%', background: 'rgba(255,92,92,0.35)', borderRadius: '3px' }} />
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Fixed for demo</div>
        </div>
        <div style={{ borderRadius: '12px', padding: '16px', textAlign: 'center', background: safe ? 'rgba(76,175,80,0.07)' : 'rgba(255,92,92,0.07)', border: `1px solid ${safe ? 'rgba(76,175,80,0.2)' : 'rgba(255,92,92,0.2)'}`, transition: 'all 0.3s ease' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '6px', letterSpacing: '0.08em' }}>COLLATERAL RATIO</div>
          <div style={{ fontSize: '38px', fontWeight: 700, fontFamily: 'monospace', color: safe ? 'var(--status-success)' : 'var(--status-error)', transition: 'color 0.3s' }}>{ratio}%</div>
          <div style={{ fontSize: '12px', marginTop: '6px', color: safe ? 'var(--status-success)' : 'var(--status-error)' }}>
            {safe ? '✓ Safe to borrow' : '⚠ Liquidation risk'}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ padding: '20px', borderRadius: '14px', background: 'linear-gradient(145deg, rgba(108,99,255,0.07), rgba(0,229,255,0.03))', border: '1px solid rgba(108,99,255,0.15)', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: 700, letterSpacing: '0.12em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Formula</div>
          <div style={{ fontStyle: 'italic', fontSize: '17px', fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>(Collateral × 100) / Debt</div>
          <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>Must be <span style={{ color: 'var(--status-success)', fontWeight: 700 }}>≥ 150%</span> at all times</div>
        </div>
        <InfoChip icon="📐" title="Minimum Ratio: 150%" body="You must always hold ≥ 150 tN for every 100 pUSD of debt." />
        <InfoChip icon="↑" title="More Collateral = More Safety" body="A higher ratio gives you a larger buffer before liquidation triggers." />
      </div>
    </div>
  );
};

// ─── Section 03: Liquidation ──────────────────────────────────────────────────

const LiquidationSection: React.FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
    <div className="glass-panel" style={{ padding: '28px' }}>
      <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '20px', textTransform: 'uppercase' }}>Position States</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <StateBadge color="var(--status-success)" bg="rgba(76,175,80,0.08)" border="rgba(76,175,80,0.2)" label="Safe" range="≥ 200%" desc="No risk." />
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px', opacity: 0.4 }}>↓</div>
        <StateBadge color="var(--status-warning)" bg="rgba(255,184,77,0.08)" border="rgba(255,184,77,0.2)" label="At Risk" range="150–200%" desc="Monitor closely." />
        <div style={{ display: 'flex', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '13px', opacity: 0.4 }}>↓</div>
        <StateBadge color="var(--status-error)" bg="rgba(255,92,92,0.08)" border="rgba(255,92,92,0.2)" label="Liquidatable" range="< 150%" desc="Open to liquidation." />
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <InfoChip icon="⚡" title="Anyone Can Liquidate" body="Liquidation is a permissionless public action to keep the protocol solvent." />
      <InfoChip icon="💸" title="Liquidator Incentive" body="The liquidator repays the debt and receives the full locked collateral: profitably." />
      <InfoChip icon="🛡" title="How to Stay Safe" body="Keep your ratio well above 150%. Deposit more collateral or repay debt regularly." />
    </div>
  </div>
);

// ─── Section 04: Privacy ─────────────────────────────────────────────────────

const PrivacySection: React.FC = () => (
  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', alignItems: 'start' }}>
    <div className="glass-panel" style={{ padding: '28px', position: 'relative', overflow: 'hidden' }}>
      <div style={{ position: 'absolute', top: '-30px', left: '50%', transform: 'translateX(-50%)', width: '180px', height: '120px', background: 'radial-gradient(ellipse, rgba(108,99,255,0.1), transparent 70%)', pointerEvents: 'none' }} />
      <div style={{ marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-primary)', boxShadow: '0 0 8px var(--accent-primary)' }} />
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-primary)' }}>Private (ZK-Hidden)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {PRIVACY_ITEMS.private.map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderRadius: '10px', background: 'rgba(108,99,255,0.06)', border: '1px solid rgba(108,99,255,0.15)', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>🔒</span>{item}
            </div>
          ))}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', margin: '8px 0' }}>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, transparent, rgba(108,99,255,0.3))' }} />
        <div style={{ padding: '5px 12px', borderRadius: '20px', background: 'rgba(108,99,255,0.1)', border: '1px solid rgba(108,99,255,0.25)', fontSize: '11px', fontWeight: 700, color: 'var(--accent-primary)', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>ZK Proof</div>
        <div style={{ flex: 1, height: '1px', background: 'linear-gradient(90deg, rgba(0,229,255,0.3), transparent)' }} />
      </div>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
          <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--accent-secondary)', boxShadow: '0 0 8px var(--accent-secondary)' }} />
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--accent-secondary)' }}>Public (On-Chain)</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
          {PRIVACY_ITEMS.public.map(item => (
            <div key={item} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 14px', borderRadius: '10px', background: 'rgba(0,229,255,0.05)', border: '1px solid rgba(0,229,255,0.12)', fontSize: '13px', color: 'var(--text-secondary)' }}>
              <span style={{ fontSize: '11px', opacity: 0.6 }}>◎</span>{item}
            </div>
          ))}
        </div>
      </div>
    </div>
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <InfoChip icon="◈" title="Prove Without Revealing" body="ZKPs let you cryptographically prove your collateral is sufficient without disclosing the amount." />
      <InfoChip icon="🌑" title="Private by Default" body="Individual positions are never exposed on the public ledger: only aggregated totals are visible." />
      <InfoChip icon="⚡" title="Local Proof Generation" body="ZK proofs are computed on your machine before submission. Your data never leaves your browser." />
    </div>
  </div>
);

// ─── Page ─────────────────────────────────────────────────────────────────────

const SECTIONS: Record<StepKey, React.ReactNode> = {
  pusd: <PUSDSection />,
  collateral: <CollateralSection />,
  liquidation: <LiquidationSection />,
  privacy: <PrivacySection />,
};

export const HowItWorks: React.FC = () => {
  const [active, setActive] = useState<StepKey>('pusd');

  return (
    <div className="animate-fade-in">
      <header style={{ marginBottom: '32px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
          <Crescent size={16} />
          <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
            Protocol Documentation
          </span>
        </div>
        <h1 style={{ fontSize: '28px', marginBottom: '6px' }}>How It Works</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '14px', maxWidth: '460px', lineHeight: 1.6 }}>
          A visual guide to pUSD, collateralisation, liquidation, and the ZK privacy model.
        </p>
      </header>

      <StepNav active={active} onSelect={setActive} />

      <div key={active} className="animate-fade-in">
        {SECTIONS[active]}
      </div>
    </div>
  );
};