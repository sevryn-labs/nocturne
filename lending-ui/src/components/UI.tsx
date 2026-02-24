import React from 'react';

interface TooltipProps {
    label: string;
    content: React.ReactNode;
}

export const Tooltip: React.FC<TooltipProps> = ({ label, content }) => {
    return (
        <span className="tooltip-container">
            <span className="stat-label">
                {label} <span className="tooltip-icon">ⓘ</span>
            </span>
            <div className="tooltip-box">
                {content}
            </div>
        </span>
    );
};

export const RiskBar: React.FC<{ ratio: number }> = ({ ratio }) => {
    // 150% is the threshold. We'll map 100% to 300% on the bar.
    // 150% will be at roughly 25% of the bar width if we start at 100.
    // Actually let's just use a simple percentage: 150 = danger zone end.

    let colorClass = 'risk-bar-danger';
    if (ratio >= 170) colorClass = 'risk-bar-safe';
    else if (ratio >= 150) colorClass = 'risk-bar-warning';

    // Calculate width capped at 100%
    // If ratio is 300, it's very safe. If ratio is 150, it's edge.
    const width = Math.min(Math.max(((ratio - 100) / 200) * 100, 0), 100);

    return (
        <div className="risk-indicator">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '12px', fontWeight: 600 }}>
                <span style={{ color: 'var(--status-error)' }}>Liquidation (150%)</span>
                <span style={{ color: 'var(--status-success)' }}>Safe Area</span>
            </div>
            <div className="risk-bar-track">
                <div
                    className={`risk-bar-fill ${colorClass}`}
                    style={{
                        width: `${width}%`,
                        background: ratio >= 170 ? 'var(--status-success)' : ratio >= 150 ? 'var(--status-warning)' : 'var(--status-error)'
                    }}
                />
                <div
                    className="risk-marker"
                    style={{ left: '25%' }} /* 150% mark if 100-300 scale: (150-100)/200 = 0.25 */
                />
            </div>
            <div style={{ marginTop: '8px', textAlign: 'right', fontSize: '12px', color: 'var(--text-muted)' }}>
                Current: <span style={{ color: 'white', fontWeight: 'bold' }}>{ratio === Infinity ? '∞' : `${ratio.toFixed(1)}%`}</span>
            </div>
        </div>
    );
};
