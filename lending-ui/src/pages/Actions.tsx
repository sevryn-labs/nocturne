// pUSD Lending Protocol: Actions Page
// Card-based interface for all lending operations.

import React, { useEffect, useState, useMemo } from 'react';
import { useApp } from '../context.tsx';
import { useNavigate } from 'react-router-dom';
import { Tooltip, RiskBar } from '../components/UI.tsx';

type ActionTab = 'deposit' | 'mint' | 'repay' | 'withdraw' | 'liquidate';

// ─── Action metadata ──────────────────────────────────────────────────────────

const ACTION_CARDS: {
  key: ActionTab;
  label: string;
  desc: string;
  icon: string;
  accentColor: string;
  accentBg: string;
  accentBorder: string;
  tooltip: string;
}[] = [
    {
      key: 'deposit',
      label: 'Deposit Collateral',
      desc: 'Lock tNight to enable borrowing and improve your health factor.',
      icon: '↓',
      accentColor: 'var(--status-success)',
      accentBg: 'rgba(76,175,80,0.07)',
      accentBorder: 'rgba(76,175,80,0.2)',
      tooltip: 'Locking more collateral improves your health factor and allows you to mint more pUSD.',
    },
    {
      key: 'mint',
      label: 'Mint pUSD',
      desc: 'Borrow synthetic credit units against your locked collateral.',
      icon: '✦',
      accentColor: 'var(--accent-secondary)',
      accentBg: 'rgba(0,229,255,0.06)',
      accentBorder: 'rgba(0,229,255,0.18)',
      tooltip: 'Minting pUSD increases your debt. Ensure your ratio stays above 150%.',
    },
    {
      key: 'repay',
      label: 'Repay pUSD',
      desc: 'Reduce your debt and bring your position back to safety.',
      icon: '↺',
      accentColor: 'var(--accent-primary)',
      accentBg: 'rgba(108,99,255,0.07)',
      accentBorder: 'rgba(108,99,255,0.2)',
      tooltip: 'Repaying pUSD removes debt from your position, making it safer from liquidation.',
    },
    {
      key: 'withdraw',
      label: 'Withdraw Collateral',
      desc: 'Reclaim tNight while keeping your ratio above 150%.',
      icon: '↑',
      accentColor: 'var(--status-warning)',
      accentBg: 'rgba(255,184,77,0.07)',
      accentBorder: 'rgba(255,184,77,0.2)',
      tooltip: 'You can only withdraw collateral if your remaining ratio stays above 150%.',
    },
    {
      key: 'liquidate',
      label: 'Liquidate',
      desc: 'Close an undercollateralised position and claim the locked collateral.',
      icon: '⚡',
      accentColor: 'var(--status-error)',
      accentBg: 'rgba(255,92,92,0.06)',
      accentBorder: 'rgba(255,92,92,0.18)',
      tooltip: "Liquidation maintains protocol health. Requires repaying the victim's full debt.",
    },
  ];

// ─── Sub-components ───────────────────────────────────────────────────────────

const ActionIconBadge: React.FC<{
  icon: string;
  color: string;
  bg: string;
  border: string;
  size?: number;
}> = ({ icon, color, bg, border, size = 44 }) => (
  <div
    style={{
      width: size,
      height: size,
      borderRadius: '12px',
      flexShrink: 0,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: size * 0.42,
      fontWeight: 700,
      color,
      background: bg,
      border: `1px solid ${border}`,
      boxShadow: `0 0 16px ${bg}`,
    }}
  >
    {icon}
  </div>
);

const AlertBox: React.FC<{ type: 'error' | 'success'; children: React.ReactNode }> = ({ type, children }) => (
  <div
    style={{
      padding: '13px 16px',
      borderRadius: '12px',
      marginBottom: '20px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: '10px',
      background: type === 'error' ? 'rgba(255,92,92,0.08)' : 'rgba(76,175,80,0.08)',
      border: `1px solid ${type === 'error' ? 'rgba(255,92,92,0.2)' : 'rgba(76,175,80,0.2)'}`,
      color: type === 'error' ? 'var(--status-error)' : 'var(--status-success)',
      fontSize: '14px',
      lineHeight: 1.5,
    }}
  >
    <span style={{ flexShrink: 0, marginTop: '1px' }}>{type === 'error' ? '⚠' : '✓'}</span>
    <span>{children}</span>
  </div>
);

const FieldHint: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ marginTop: '8px', fontSize: '12px', color: 'var(--text-muted)' }}>{children}</div>
);

// ─── Main component ───────────────────────────────────────────────────────────

export const Actions: React.FC = () => {
  const { state, actions } = useApp();
  const navigate = useNavigate();
  const [selectedAction, setSelectedAction] = useState<ActionTab | null>(null);

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
      const actionFn = {
        deposit: actions.deposit,
        mint: actions.mint,
        repay: actions.repay,
        withdraw: actions.withdraw,
      }[selectedAction];
      await actionFn(amount);
    }
    setAmount('');
    setVictimCollateral('');
    setVictimDebt('');
    setSelectedAction(null);
  };

  const activeCard = ACTION_CARDS.find(c => c.key === selectedAction);

  // ── Card grid ────────────────────────────────────────────────────────────────
  if (!selectedAction) {
    return (
      <div className="animate-fade-in">
        <header style={{ marginBottom: '40px' }}>
          {/* Eyebrow */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <div
              style={{
                width: '16px',
                height: '16px',
                borderRadius: '50%',
                boxShadow: 'inset -4px 1px 0 0 var(--moon-silver), 0 0 8px rgba(200,214,232,0.12)',
                border: '1px solid rgba(200,214,232,0.1)',
                flexShrink: 0,
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
              ZK-Powered Operations
            </span>
          </div>

          <h1 style={{ fontSize: '32px', marginBottom: '8px' }}>Actions</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '15px', lineHeight: 1.6 }}>
            All lending operations generate zero-knowledge proofs locally on your machine.
          </p>
        </header>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
          }}
        >
          {ACTION_CARDS.map(card => (
            <div
              key={card.key}
              className="card"
              onClick={() => setSelectedAction(card.key)}
              style={{
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '16px',
                padding: '24px',
                border: `1px solid ${card.accentBorder}`,
                transition: 'all 0.25s ease',
                position: 'relative',
                overflow: 'hidden',
              }}
            >
              {/* Top accent line */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: '15%',
                  right: '15%',
                  height: '1px',
                  background: `linear-gradient(90deg, transparent, ${card.accentBorder}, transparent)`,
                }}
              />

              {/* Header row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <ActionIconBadge
                  icon={card.icon}
                  color={card.accentColor}
                  bg={card.accentBg}
                  border={card.accentBorder}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h3 style={{ fontSize: '16px', marginBottom: '2px', color: 'var(--text-primary)' }}>
                    {card.label}
                  </h3>
                </div>
                <Tooltip label="" content={card.tooltip} />
              </div>

              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', lineHeight: 1.6, flex: 1 }}>
                {card.desc}
              </p>

              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: card.accentColor, fontSize: '13px', fontWeight: 600 }}>
                <span>Start Action</span>
                <span style={{ fontSize: '16px', lineHeight: 1 }}>→</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ── Action form ──────────────────────────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Back + title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '36px' }}>
        <button
          className="btn btn-ghost"
          onClick={() => { setSelectedAction(null); setAmount(''); }}
          style={{ padding: '10px 16px', fontSize: '14px', gap: '6px' }}
        >
          ← Back
        </button>
        {activeCard && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <ActionIconBadge
              icon={activeCard.icon}
              color={activeCard.accentColor}
              bg={activeCard.accentBg}
              border={activeCard.accentBorder}
              size={38}
            />
            <h2 style={{ fontSize: '22px' }}>{activeCard.label}</h2>
          </div>
        )}
      </div>

      <div style={{ maxWidth: '560px' }}>
        <div className="card" style={{ padding: '28px' }}>
          {/* Alerts */}
          {state.actionError && <AlertBox type="error">{state.actionError}</AlertBox>}
          {state.lastTxHash && (
            <AlertBox type="success">
              Transaction confirmed: <span style={{ fontFamily: 'monospace', fontSize: '12px' }}>{state.lastTxHash.slice(0, 16)}…</span>
            </AlertBox>
          )}

          {selectedAction !== 'liquidate' ? (
            <>
              {/* Amount input */}
              <div className="form-group">
                <label className="form-label">
                  {selectedAction === 'deposit' ? 'tNight to Lock'
                    : selectedAction === 'withdraw' ? 'tNight to Reclaim'
                      : selectedAction === 'mint' ? 'pUSD to Mint'
                        : 'pUSD to Repay'}
                </label>
                <input
                  className="form-input"
                  type="text"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  autoFocus
                  style={{ fontSize: '20px', fontFamily: 'monospace' }}
                />
                {selectedAction === 'repay' && <FieldHint>Available debt: {debt.toLocaleString()} pUSD</FieldHint>}
                {selectedAction === 'withdraw' && <FieldHint>Available collateral: {collateral.toLocaleString()} tN</FieldHint>}
              </div>

              {/* Projected health preview */}
              {previewRatio && (
                <div
                  className="glass-panel"
                  style={{
                    marginBottom: '24px',
                    border: previewRatio.safe
                      ? '1px solid rgba(76,175,80,0.15)'
                      : '1px solid rgba(255,92,92,0.25)',
                    background: previewRatio.safe
                      ? 'rgba(76,175,80,0.04)'
                      : 'rgba(255,92,92,0.05)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                    <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 600, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                      Projected Health
                    </span>
                    <span
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: previewRatio.safe ? 'var(--status-success)' : 'var(--status-error)',
                        fontFamily: 'monospace',
                      }}
                    >
                      {previewRatio.ratio === Infinity ? '∞' : `${previewRatio.ratio.toFixed(1)}%`}
                    </span>
                  </div>
                  <RiskBar ratio={previewRatio.ratio} />
                  {!previewRatio.safe && (
                    <p style={{ fontSize: '12px', color: 'var(--status-error)', marginTop: '10px', display: 'flex', gap: '6px', alignItems: 'center' }}>
                      <span>⚠</span> This action would expose your position to immediate liquidation risk.
                    </p>
                  )}
                </div>
              )}
            </>
          ) : (
            /* Liquidate form */
            <div style={{ display: 'grid', gap: '20px', marginBottom: '4px' }}>
              <div
                style={{
                  padding: '14px',
                  borderRadius: '12px',
                  background: 'rgba(255,92,92,0.06)',
                  border: '1px solid rgba(255,92,92,0.15)',
                  fontSize: '13px',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.6,
                }}
              >
                ⚡ Enter the exact collateral and debt values of the undercollateralised position. You will repay their debt and receive their collateral.
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Victim's Collateral (tNight)</label>
                <input
                  className="form-input"
                  type="text"
                  value={victimCollateral}
                  onChange={(e) => setVictimCollateral(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
              <div className="form-group" style={{ marginBottom: 0 }}>
                <label className="form-label">Victim's Debt (pUSD)</label>
                <input
                  className="form-input"
                  type="text"
                  value={victimDebt}
                  onChange={(e) => setVictimDebt(e.target.value.replace(/[^0-9]/g, ''))}
                  placeholder="0"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
            </div>
          )}

          {/* Submit */}
          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: '8px' }}
            onClick={handleSubmit}
            disabled={
              state.actionLoading ||
              (selectedAction === 'liquidate' ? !victimCollateral || !victimDebt : !amount)
            }
          >
            {state.actionLoading ? (
              <>
                <div className="loading-orbit" style={{ width: '18px', height: '18px' }} />
                Generating ZK Proof…
              </>
            ) : (
              'Confirm Transaction'
            )}
          </button>

          {state.actionLoading && (
            <p
              style={{
                marginTop: '14px',
                fontSize: '12px',
                color: 'var(--text-muted)',
                textAlign: 'center',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '10px', opacity: 0.5 }}>🌑</span>
              Please do not close your browser while the proof is being generated.
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBigInt(s: string): bigint {
  try {
    const cleaned = s.replace(/[^0-9]/g, '');
    return cleaned ? BigInt(cleaned) : 0n;
  } catch {
    return 0n;
  }
}