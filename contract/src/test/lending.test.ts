// pUSD Lending Protocol — Unit Tests
//
// These tests use the LendingSimulator to exercise every circuit's
// happy-path and enforced constraint without a live Midnight node.
//
// Run with: npm test (from the contract/ directory, after npm run compact)

import { LendingSimulator } from './lending-simulator.js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect } from 'vitest';

setNetworkId('undeployed');

// ─────────────────────────────────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────────────────────────────────

const RATIO_150 = 150n; // Minimum collateral ratio (%)

// ─────────────────────────────────────────────────────────────────────────────
// Initialisation
// ─────────────────────────────────────────────────────────────────────────────

describe('Lending contract — Initialisation', () => {
    it('initialises to deterministic public state', () => {
        const s0 = new LendingSimulator();
        const s1 = new LendingSimulator();
        expect(s0.getLedger()).toEqual(s1.getLedger());
    });

    it('starts with zeroed totals', () => {
        const sim = new LendingSimulator();
        const lstate = sim.getLedger();
        expect(lstate.totalCollateral).toBe(0n);
        expect(lstate.totalDebt).toBe(0n);
    });

    it('starts with liquidationRatio = 150 and mintingRatio = 150', () => {
        const sim = new LendingSimulator();
        const lstate = sim.getLedger();
        expect(lstate.liquidationRatio).toBe(150n);
        expect(lstate.mintingRatio).toBe(150n);
    });

    it('starts with zeroed private state', () => {
        const sim = new LendingSimulator();
        const ps = sim.getPrivateState();
        expect(ps.collateralAmount).toBe(0n);
        expect(ps.debtAmount).toBe(0n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// depositCollateral
// ─────────────────────────────────────────────────────────────────────────────

describe('depositCollateral', () => {
    it('increases totalCollateral by the deposited amount', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_000n);
        expect(sim.getLedger().totalCollateral).toBe(1_000n);
    });

    it('updates private collateral state', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(500n);
        expect(sim.getPrivateState().collateralAmount).toBe(500n);
    });

    it('accumulates across multiple deposits', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(300n);
        sim.depositCollateral(700n);
        expect(sim.getLedger().totalCollateral).toBe(1_000n);
        expect(sim.getPrivateState().collateralAmount).toBe(1_000n);
    });

    it('rejects a zero deposit', () => {
        const sim = new LendingSimulator();
        expect(() => sim.depositCollateral(0n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// mintPUSD
// ─────────────────────────────────────────────────────────────────────────────

describe('mintPUSD', () => {
    it('increases totalDebt by the minted amount', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_500n);
        sim.mintPUSD(1_000n);
        expect(sim.getLedger().totalDebt).toBe(1_000n);
    });

    it('updates private debt state', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_500n);
        sim.mintPUSD(1_000n);
        expect(sim.getPrivateState().debtAmount).toBe(1_000n);
    });

    it('allows minting exactly at 150% ratio', () => {
        // 150 collateral → max mint = 100 pUSD (ratio = 150%)
        const sim = new LendingSimulator();
        sim.depositCollateral(150n);
        expect(() => sim.mintPUSD(100n)).not.toThrow();
        expect(sim.getLedger().totalDebt).toBe(100n);
    });

    it('rejects minting that would breach the 150% ratio', () => {
        // 150 collateral → 101 pUSD → ratio = 148.5% < 150%
        const sim = new LendingSimulator();
        sim.depositCollateral(150n);
        expect(() => sim.mintPUSD(101n)).toThrow();
    });

    it('rejects minting with zero collateral', () => {
        const sim = new LendingSimulator();
        expect(() => sim.mintPUSD(1n)).toThrow();
    });

    it('rejects a zero mint amount', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_000n);
        expect(() => sim.mintPUSD(0n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// repayPUSD
// ─────────────────────────────────────────────────────────────────────────────

describe('repayPUSD', () => {
    it('decreases totalDebt by the repaid amount', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_500n);
        sim.mintPUSD(1_000n);
        sim.repayPUSD(400n);
        expect(sim.getLedger().totalDebt).toBe(600n);
    });

    it('allows full repayment', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_500n);
        sim.mintPUSD(1_000n);
        sim.repayPUSD(1_000n);
        expect(sim.getLedger().totalDebt).toBe(0n);
        expect(sim.getPrivateState().debtAmount).toBe(0n);
    });

    it('rejects repaying more than the outstanding debt', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_500n);
        sim.mintPUSD(500n);
        expect(() => sim.repayPUSD(501n)).toThrow();
    });

    it('rejects a zero repay amount', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_500n);
        sim.mintPUSD(500n);
        expect(() => sim.repayPUSD(0n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// withdrawCollateral
// ─────────────────────────────────────────────────────────────────────────────

describe('withdrawCollateral', () => {
    it('decreases totalCollateral by the withdrawn amount', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_000n);
        sim.withdrawCollateral(300n);
        expect(sim.getLedger().totalCollateral).toBe(700n);
    });

    it('allows full withdrawal when there is no debt', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_000n);
        sim.withdrawCollateral(1_000n);
        expect(sim.getLedger().totalCollateral).toBe(0n);
        expect(sim.getPrivateState().collateralAmount).toBe(0n);
    });

    it('allows partial withdrawal that keeps ratio ≥ 150%', () => {
        // Deposit 1500, mint 1000 (ratio = 150%). Withdraw 1 → ratio = 1499/1000 * 100 = 149.9% → should fail
        // Deposit 3000, mint 1000 (ratio = 300%). Withdraw 1500 → ratio = 1500/1000 * 100 = 150% → should pass
        const sim = new LendingSimulator();
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        expect(() => sim.withdrawCollateral(1_500n)).not.toThrow();
        expect(sim.getLedger().totalCollateral).toBe(1_500n);
    });

    it('rejects withdrawal that would breach the 150% ratio', () => {
        // Deposit 1500, mint 1000 (ratio exactly 150%). Any withdrawal breaks it.
        const sim = new LendingSimulator();
        sim.depositCollateral(1_500n);
        sim.mintPUSD(1_000n);
        expect(() => sim.withdrawCollateral(1n)).toThrow();
    });

    it('rejects withdrawing more than deposited', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(500n);
        expect(() => sim.withdrawCollateral(501n)).toThrow();
    });

    it('rejects a zero withdrawal', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(500n);
        expect(() => sim.withdrawCollateral(0n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// liquidate
// ─────────────────────────────────────────────────────────────────────────────

describe('liquidate', () => {
    it('allows liquidation of an undercollateralised position', () => {
        const sim = new LendingSimulator();
        // Seed the public totals to match the victim's position
        sim.depositCollateral(1_000n);
        sim.mintPUSD(666n); // ratio = 1000*100/666 ≈ 150.15% — just safe

        // Imagine the "victim" has: 100 collateral, 100 debt → ratio = 100%
        // We call liquidate directly with those values.
        // First top up totalCollateral so the contract has tokens to send back.
        sim.depositCollateral(100n);
        // Liquidate the victim's position (ratio 100% < 150%)
        expect(() => sim.liquidate(100n, 100n)).not.toThrow();

        // After liquidation: totalCollateral -= 100, totalDebt -= 100
        expect(sim.getLedger().totalCollateral).toBe(1_000n); // 1100 - 100 = 1000
        expect(sim.getLedger().totalDebt).toBe(566n);         // 666 - 100 = 566
    });

    it('rejects liquidation of a healthy position (ratio ≥ 150%)', () => {
        const sim = new LendingSimulator();
        // 150 collateral, 100 debt → ratio = 150% (not liquidatable)
        sim.depositCollateral(1_000n);
        expect(() => sim.liquidate(150n, 100n)).toThrow();
    });

    it('rejects liquidation with zero debt', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_000n);
        expect(() => sim.liquidate(100n, 0n)).toThrow();
    });

    it('rejects liquidation with zero collateral', () => {
        const sim = new LendingSimulator();
        sim.depositCollateral(1_000n);
        expect(() => sim.liquidate(0n, 100n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Full end-to-end flow: Deposit → Mint → Repay → Withdraw
// ─────────────────────────────────────────────────────────────────────────────

describe('End-to-end: Deposit → Mint → Repay → Withdraw', () => {
    it('completes a full lifecycle without errors', () => {
        const sim = new LendingSimulator();

        // 1. Deposit 3000 tNight
        sim.depositCollateral(3_000n);
        expect(sim.getLedger().totalCollateral).toBe(3_000n);
        expect(sim.getPrivateState().collateralAmount).toBe(3_000n);

        // 2. Mint 2000 pUSD (ratio = 3000/2000 * 100 = 150% — exactly at limit)
        sim.mintPUSD(2_000n);
        expect(sim.getLedger().totalDebt).toBe(2_000n);
        expect(sim.getPrivateState().debtAmount).toBe(2_000n);

        // 3. Repay 2000 pUSD (full repayment)
        sim.repayPUSD(2_000n);
        expect(sim.getLedger().totalDebt).toBe(0n);
        expect(sim.getPrivateState().debtAmount).toBe(0n);

        // 4. Withdraw all collateral (no debt left, no ratio constraint)
        sim.withdrawCollateral(3_000n);
        expect(sim.getLedger().totalCollateral).toBe(0n);
        expect(sim.getPrivateState().collateralAmount).toBe(0n);
    });

    it('correctly enforces ratio guard across sequential operations', () => {
        const sim = new LendingSimulator();

        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n); // ratio = 300%, healthy

        // Extra deposit → can borrow more
        sim.depositCollateral(1_500n); // now 4500 collateral, 1000 debt → ratio = 450%
        sim.mintPUSD(2_000n);           // now 4500 collateral, 3000 debt → ratio = 150%

        // Any more minting should fail
        expect(() => sim.mintPUSD(1n)).toThrow();

        // Partial repayment frees up some ratio
        sim.repayPUSD(1_500n); // now 4500 collateral, 1500 debt → ratio = 300%
        expect(() => sim.mintPUSD(1_000n)).not.toThrow(); // 4500 / 2500 = 180% — ok
    });
});
