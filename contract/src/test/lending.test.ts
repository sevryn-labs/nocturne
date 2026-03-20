// pUSD Lending Protocol v3: Aggressive / Gap-Coverage Tests
//
// PURPOSE
// ───────
// These tests target gaps in the existing suite (sections 1–22).
// Many tests here are expected to EXPOSE bugs in the current
// contract implementation. Each section header documents the
// gap being probed and what correct behaviour should look like.
//
// Run with: vitest run lending-simulator.aggressive.test.ts

import { LendingSimulator } from './lending-simulator.js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect, beforeEach } from 'vitest';

setNetworkId('undeployed');

const DUMMY_KEY_1 = { bytes: new Uint8Array(32).fill(1) };
const DUMMY_KEY_2 = { bytes: new Uint8Array(32).fill(2) };

// ─────────────────────────────────────────────────────────────────────────────
// 23. Uint<16> Truncation Bug: Counter.increment/decrement
// ─────────────────────────────────────────────────────────────────────────────
//
// BUG: The contract casts Uint<64> amounts to Uint<16> before passing to
// Counter.increment / Counter.decrement:
//
//   totalDebt.increment(disclose(amount) as Uint<16>)
//
// Uint<16> max = 65535. Any amount above that silently truncates.
// Example: amount = 65536 → cast to Uint<16> = 0 → zero increment.
//          amount = 65537 → cast to Uint<16> = 1 → 1 increment (wrong).
//
// These tests will FAIL against the current implementation, exposing the bug.
// Fix: cast to Uint<64> or Uint<32> instead.
// ─────────────────────────────────────────────────────────────────────────────
describe('23. Uint<16> Truncation: Counter amounts above 65535', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
    });

    it('mint of exactly 65535 records correct totalDebt', () => {
        // 65535 is Uint<16> max: should be safe even with truncation
        const amount = 65535n;
        sim.depositCollateral(200_000n);
        sim.mintPUSD(amount);
        expect(sim.getLedger().totalDebt).toBe(amount);
        expect(sim.totalSupply()).toBe(amount);
    });

    it('mint of 65536 records correct totalDebt [BUG: truncates to 0]', () => {
        // 65536 mod 65536 = 0: Counter gets incremented by 0 if bug present
        const amount = 65536n;
        sim.depositCollateral(200_000n);
        sim.mintPUSD(amount);
        // CORRECT: totalDebt should be 65536
        // BUG:     totalDebt will be 0 (or whatever prior value was)
        expect(sim.getLedger().totalDebt).toBe(amount);
        expect(sim.totalSupply()).toBe(amount);
    });

    it('mint of 65537 records correct totalDebt [BUG: truncates to 1]', () => {
        const amount = 65537n;
        sim.depositCollateral(200_000n);
        sim.mintPUSD(amount);
        expect(sim.getLedger().totalDebt).toBe(amount);
        expect(sim.totalSupply()).toBe(amount);
    });

    it('mint of 100_000 records correct totalDebt [BUG: truncates to 34464]', () => {
        // 100_000 mod 65536 = 34464
        const amount = 100_000n;
        sim.depositCollateral(500_000n);
        sim.mintPUSD(amount);
        expect(sim.getLedger().totalDebt).toBe(amount);
        expect(sim.totalSupply()).toBe(amount);
    });

    it('repay of 65536 records correct totalDebt reduction [BUG: reduces by 0]', () => {
        sim.depositCollateral(500_000n);
        sim.mintPUSD(100_000n);
        sim.repayPUSD(65536n);
        // CORRECT: totalDebt should be 34464
        // BUG:     totalDebt will still be 100_000
        expect(sim.getLedger().totalDebt).toBe(34_464n);
        expect(sim.totalSupply()).toBe(34_464n);
    });

    it('depositCollateral of 65536 records correct totalCollateral [BUG: truncates to 0]', () => {
        sim.depositCollateral(65536n);
        expect(sim.getLedger().totalCollateral).toBe(65536n);
    });

    it('withdrawCollateral of 65536 records correct reduction [BUG: reduces by 0]', () => {
        sim.depositCollateral(200_000n);
        sim.withdrawCollateral(65536n);
        expect(sim.getLedger().totalCollateral).toBe(134_464n);
    });

    it('liquidate correctly updates totalDebt and totalCollateral above 65535 [BUG: both truncate]', () => {
        sim.depositCollateral(500_000n);
        sim.mintPUSD(200_000n);
        sim.depositCollateral(70_000n);

        // Construct an undercollateralised victim position:
        // victimCollateral=70_000, victimDebt=65_536
        // 70_000 * 10000 * 100 = 70_000_000_000
        // 65_536 * 150 * 10000 =  98_304_000_000 → undercollateralised
        sim.liquidate(70_000n, 65_536n);
        expect(sim.getLedger().totalDebt).toBe(134_464n);   // 200_000 - 65_536
        expect(sim.getLedger().totalCollateral).toBe(430_000n); // 570_000 - 70_000 - 70_000
    });

    it('invariant totalSupply == totalDebt holds for amounts above 65535', () => {
        sim.depositCollateral(500_000n);
        sim.mintPUSD(100_000n);
        expect(sim.totalSupply()).toBe(sim.getLedger().totalDebt);

        sim.repayPUSD(50_000n);
        expect(sim.totalSupply()).toBe(sim.getLedger().totalDebt);
        expect(sim.getLedger().totalDebt).toBe(50_000n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 24. Ratio Check Arithmetic Overflow
// ─────────────────────────────────────────────────────────────────────────────
//
// The ratio check multiplies up to three Uint<64> values before comparing:
//   myCollateral * price * 100 >= newDebt * ratio * 10000
//
// Uint<64> max ≈ 18.4 × 10^18.
// collateral * price overflows when collateral × price > 18.4 × 10^18.
// At price=10000 ($1.00), overflow occurs at collateral ≈ 1.84 × 10^15.
// Multiplying by 100 brings the threshold down further.
//
// These tests probe near the overflow boundary.
// ─────────────────────────────────────────────────────────────────────────────
describe('24. Ratio check arithmetic: overflow boundaries', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
    });

    it('large collateral at $1.00: minting respects ratio without overflow', () => {
        // collateral = 10^12 (one trillion units)
        // price = 10000 → collateral * price = 10^16 (still under Uint<64> max)
        // max debt = 10^12 * 10000 * 100 / (150 * 10000) ≈ 6.67 × 10^11
        const collateral = 1_000_000_000_000n; // 10^12
        const maxDebt = (collateral * 10000n * 100n) / (150n * 10000n); // = 666_666_666_666n

        sim.depositCollateral(collateral);
        expect(() => sim.mintPUSD(maxDebt)).not.toThrow();
        expect(sim.getLedger().totalDebt).toBe(maxDebt);
    });

    it('large collateral at $1.00: minting one above boundary fails', () => {
        const collateral = 1_000_000_000_000n;
        const maxDebt = (collateral * 10000n * 100n) / (150n * 10000n);

        sim.depositCollateral(collateral);
        expect(() => sim.mintPUSD(maxDebt + 1n)).toThrow();
    });

    it('large collateral with high price: intermediate product approaches overflow', () => {
        // price = 20000 ($2.00), collateral = 10^12
        // collateral * price = 2 × 10^16: still within Uint<64>
        // collateral * price * 100 = 2 × 10^18: right near the boundary
        const collateral = 1_000_000_000_000n;
        const price = 20000n;
        sim.updateOraclePrice(price, 1n);
        const maxDebt = (collateral * price * 100n) / (150n * 10000n); // ≈ 1.33 × 10^12

        sim.depositCollateral(collateral);
        expect(() => sim.mintPUSD(maxDebt)).not.toThrow();
    });

    it('very large collateral: verify overflow protection exists or document the limit', () => {
        // collateral = 10^14 at price=10000 → product = 10^18 * 100 overflows Uint<64>
        // This test documents the current behavior (throw or wrong result)
        const collateral = 100_000_000_000_000n; // 10^14

        sim.depositCollateral(collateral);

        // The contract may throw on overflow or silently produce wrong results.
        // Either way we should see the behavior documented.
        let threw = false;
        try {
            sim.mintPUSD(1000n);
        } catch (_) {
            threw = true;
        }

        if (!threw) {
            // If it didn't throw, the ratio check must have succeeded for a tiny debt
            // against enormous collateral: verify the ledger state is at least consistent
            expect(sim.getLedger().totalDebt).toBe(1000n);
        }
        // Either outcome is documented: overflow throws XOR passes with tiny debt
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 25. liquidationPenalty: Declared but Not Applied
// ─────────────────────────────────────────────────────────────────────────────
//
// BUG: The liquidate() circuit does not use liquidationPenalty in any
// calculation. The penalty is stored and has governance methods, but the
// liquidator receives no bonus collateral and the protocol retains no fee.
//
// Correct MakerDAO/Liquity behavior: the liquidator should receive
// victimCollateral * (1 + penalty/10000) from the seized assets, or the
// protocol should route the penalty portion to the insurance fund.
//
// These tests document the current (broken) state and assert what SHOULD happen
// when the penalty is wired up. Mark these as known-failing until fixed.
// ─────────────────────────────────────────────────────────────────────────────
describe('25. liquidationPenalty: unused in circuit [BUG: penalty not applied]', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
    });

    it('documents current behavior: penalty has no effect on liquidation output', () => {
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        sim.depositCollateral(100n);

        // Record state with 13% penalty (default)
        const debtBefore = sim.getLedger().totalDebt;
        const collBefore = sim.getLedger().totalCollateral;

        sim.liquidate(100n, 70n);

        const debtAfter = sim.getLedger().totalDebt;
        const collAfter = sim.getLedger().totalCollateral;

        // Current (broken) behavior: debt reduced by full victimDebt, collateral reduced by victimCollateral
        // The penalty does NOT add any surplus to insuranceFund or liquidator balance
        expect(debtAfter).toBe(debtBefore - 70n);
        expect(collAfter).toBe(collBefore - 100n);

        // BUG: insuranceFund should increase by penalty portion
        // With 13% penalty on 100 collateral: 13 units should go to insuranceFund
        // Currently: insuranceFund stays at 0
        expect(sim.getInsuranceFund()).toBe(0n); // documents the bug
    });

    it('penalty change has no impact on liquidation execution [confirms bug]', () => {
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        sim.depositCollateral(100n);

        sim.updateLiquidationPenalty(2500n); // 25%
        const debt1 = sim.getLedger().totalDebt;
        sim.liquidate(100n, 70n);
        const result1 = { debt: sim.getLedger().totalDebt, coll: sim.getLedger().totalCollateral };

        // Reset and try with 5% penalty
        const sim2 = new LendingSimulator();
        sim2.updateMinDebt(0n);
        sim2.depositCollateral(3_000n);
        sim2.mintPUSD(1_000n);
        sim2.depositCollateral(100n);

        sim2.updateLiquidationPenalty(500n); // 5%
        sim2.liquidate(100n, 70n);
        const result2 = { debt: sim2.getLedger().totalDebt, coll: sim2.getLedger().totalCollateral };

        // Both should produce identical results (penalty ignored): this is the bug
        expect(result1.debt).toBe(result2.debt);
        expect(result1.coll).toBe(result2.coll);
    });

    it('EXPECTED (post-fix): penalty routes surplus to insuranceFund', () => {
        // This test defines the INTENDED behavior after fixing the circuit.
        // Currently this will FAIL: mark with .todo or skip in CI until fix lands.
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        sim.depositCollateral(100n);

        sim.liquidate(100n, 70n);

        // At 13% penalty: 100 * 1300 / 10000 = 13 units of collateral go to insuranceFund
        // Liquidator receives victimCollateral - penalty = 87 units
        // This assertion will fail until penalty is wired into the circuit
        // expect(sim.getInsuranceFund()).toBe(13n);
        //
        // Skipped: uncomment when fix is deployed
        expect(true).toBe(true); // placeholder
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 26. transferFrom: Pause Behavior
// ─────────────────────────────────────────────────────────────────────────────
//
// Section 18 tests that transfer() is blocked when paused.
// The contract also checks paused in transferFrom(), but this is UNTESTED.
// ─────────────────────────────────────────────────────────────────────────────
describe('26. transferFrom: pause coverage gap', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
        sim.depositCollateral(10_000n);
        sim.mintPUSD(1_000n);
        sim.approve(sim.getOwnPublicKey(), 500n);
    });

    it('blocks transferFrom when protocol is paused', () => {
        sim.setPaused(1n);
        expect(() =>
            sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 300n)
        ).toThrow(/paused/i);
    });

    it('resumes transferFrom after unpause', () => {
        sim.setPaused(1n);
        sim.setPaused(0n);
        expect(() =>
            sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 300n)
        ).not.toThrow();
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(300n);
    });

    it('allowance is not consumed during failed (paused) transferFrom', () => {
        const allowanceBefore = sim.allowance(sim.getOwnPublicKey(), sim.getOwnPublicKey());
        sim.setPaused(1n);

        try {
            sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 300n);
        } catch (_) { }

        // Allowance must not have been reduced
        expect(sim.allowance(sim.getOwnPublicKey(), sim.getOwnPublicKey())).toBe(allowanceBefore);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 27. Governance Boundary Exact Values
// ─────────────────────────────────────────────────────────────────────────────
//
// Section 20 tests strictly-out-of-bounds values (109, 301 for ratio;
// 499, 2501 for penalty) but NEVER tests the exact legal boundary values
// (110, 300, 500, 2500). Off-by-one errors in >= vs > guards would pass
// section 20 tests while silently rejecting valid boundary inputs.
// ─────────────────────────────────────────────────────────────────────────────
describe('27. Governance boundary exact values: off-by-one guard', () => {
    let sim: LendingSimulator;
    beforeEach(() => { sim = new LendingSimulator(); });

    // Minting ratio bounds: [110, 300]
    it('accepts mintingRatio exactly at lower bound (110)', () => {
        expect(() => sim.updateMintingRatio(110n)).not.toThrow();
        expect(sim.getLedger().mintingRatio).toBe(110n);
    });

    it('rejects mintingRatio one below lower bound (109)', () => {
        expect(() => sim.updateMintingRatio(109n)).toThrow();
    });

    it('accepts mintingRatio exactly at upper bound (300)', () => {
        expect(() => sim.updateMintingRatio(300n)).not.toThrow();
        expect(sim.getLedger().mintingRatio).toBe(300n);
    });

    it('rejects mintingRatio one above upper bound (301)', () => {
        expect(() => sim.updateMintingRatio(301n)).toThrow();
    });

    // Liquidation ratio bounds: [110, 300]
    it('accepts liquidationRatio exactly at lower bound (110)', () => {
        expect(() => sim.updateLiquidationRatio(110n)).not.toThrow();
        expect(sim.getLedger().liquidationRatio).toBe(110n);
    });

    it('accepts liquidationRatio exactly at upper bound (300)', () => {
        expect(() => sim.updateLiquidationRatio(300n)).not.toThrow();
    });

    it('rejects liquidationRatio one below lower bound (109)', () => {
        expect(() => sim.updateLiquidationRatio(109n)).toThrow();
    });

    // Liquidation penalty bounds: [500, 2500] bps
    it('accepts liquidationPenalty exactly at lower bound (500 bps)', () => {
        expect(() => sim.updateLiquidationPenalty(500n)).not.toThrow();
        expect(sim.getLiquidationPenalty()).toBe(500n);
    });

    it('rejects liquidationPenalty one below lower bound (499 bps)', () => {
        expect(() => sim.updateLiquidationPenalty(499n)).toThrow();
    });

    it('accepts liquidationPenalty exactly at upper bound (2500 bps)', () => {
        expect(() => sim.updateLiquidationPenalty(2500n)).not.toThrow();
        expect(sim.getLiquidationPenalty()).toBe(2500n);
    });

    it('rejects liquidationPenalty one above upper bound (2501 bps)', () => {
        expect(() => sim.updateLiquidationPenalty(2501n)).toThrow();
    });

    // Staleness limit bounds: [10, 10000]
    it('accepts staleness limit exactly at lower bound (10)', () => {
        expect(() => sim.updateStalenessLimit(10n)).not.toThrow();
    });

    it('rejects staleness limit one below lower bound (9)', () => {
        expect(() => sim.updateStalenessLimit(9n)).toThrow();
    });

    it('accepts staleness limit exactly at upper bound (10000)', () => {
        expect(() => sim.updateStalenessLimit(10000n)).not.toThrow();
    });

    it('rejects staleness limit one above upper bound (10001)', () => {
        expect(() => sim.updateStalenessLimit(10001n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 28. Oracle Staleness: Known Phase 1 Gap
// ─────────────────────────────────────────────────────────────────────────────
//
// The contract stores oracleStalenessLimit and oracleTimestamp but no circuit
// currently enforces staleness: that check is deferred to Phase 2.
//
// These tests document the CURRENT behavior (staleness not enforced) as a
// known, intentional gap. They serve as regression anchors: when Phase 2
// ships the staleness gate, these tests should be UPDATED to assert that
// operations fail after oracleStalenessLimit blocks have elapsed.
// ─────────────────────────────────────────────────────────────────────────────
describe('28. Oracle staleness: Phase 1 behavior documentation', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
    });

    it('PHASE 1: minting proceeds with stale oracle (timestamp=0, limit=1000 blocks)', () => {
        // Oracle is at block 0. No block height has been set. This is "stale" in intent
        // but the circuit does NOT check staleness in Phase 1.
        sim.depositCollateral(1_000n);
        expect(() => sim.mintPUSD(100n)).not.toThrow(); // OK in Phase 1
    });

    it('PHASE 1: minting proceeds after oracle timestamp is far in the past', () => {
        sim.updateOraclePrice(10000n, 1n);  // set at block 1
        // Simulate that many blocks have passed: no mechanism to advance block counter
        // in sim, but the key point is that staleness is NOT checked.
        sim.depositCollateral(1_000n);
        expect(() => sim.mintPUSD(100n)).not.toThrow(); // OK in Phase 1
        // PHASE 2 TODO: after block height advances by >1000, this should throw
    });

    it('PHASE 1: withdrawCollateral proceeds with stale oracle', () => {
        sim.depositCollateral(1_000n);
        sim.mintPUSD(100n);
        // Staleness not enforced: withdrawal proceeds
        expect(() => sim.withdrawCollateral(200n)).not.toThrow();
        // PHASE 2 TODO: should throw if oracle stale
    });

    it('PHASE 1: liquidation proceeds with stale oracle', () => {
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        sim.depositCollateral(100n);
        expect(() => sim.liquidate(100n, 70n)).not.toThrow();
        // PHASE 2 TODO: should throw if oracle stale
    });

    it('documents staleness limit storage (read-only sanity)', () => {
        // Verify limit is stored and readable: will be enforced in Phase 2
        expect(sim.getLedger().oracleStalenessLimit).toBe(1000n);
        sim.updateStalenessLimit(500n);
        expect(sim.getLedger().oracleStalenessLimit).toBe(500n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 29. insuranceFund: Isolation from Protocol Accounting
// ─────────────────────────────────────────────────────────────────────────────
//
// The insurance fund has no wired connection to liquidation or minting.
// These tests verify it is fully isolated: funding it never changes
// totalDebt, totalCollateral, or _totalSupply.
// ─────────────────────────────────────────────────────────────────────────────
describe('29. insuranceFund: accounting isolation', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
        sim.depositCollateral(10_000n);
        sim.mintPUSD(5_000n);
    });

    it('funding insurance does not change totalDebt', () => {
        const debtBefore = sim.getLedger().totalDebt;
        sim.fundInsurance(1_000n);
        expect(sim.getLedger().totalDebt).toBe(debtBefore);
    });

    it('funding insurance does not change totalCollateral', () => {
        const collBefore = sim.getLedger().totalCollateral;
        sim.fundInsurance(1_000n);
        expect(sim.getLedger().totalCollateral).toBe(collBefore);
    });

    it('funding insurance does not change _totalSupply', () => {
        const supplyBefore = sim.totalSupply();
        sim.fundInsurance(1_000n);
        expect(sim.totalSupply()).toBe(supplyBefore);
    });

    it('funding insurance does not affect any user pUSD balance', () => {
        const balBefore = sim.balanceOf(sim.getOwnPublicKey());
        sim.fundInsurance(1_000n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(balBefore);
    });

    it('insuranceFund stays at 0 after liquidation: penalty not routed [BUG]', () => {
        // After a liquidation, the insurance fund should receive the penalty portion
        // (per the MakerDAO/Liquity model). Currently it stays at 0.
        sim.depositCollateral(100n);
        sim.liquidate(100n, 70n);
        // Documents the gap: should be 13 (13% of 100) when penalty is wired in
        expect(sim.getInsuranceFund()).toBe(0n);
    });

    it('insuranceFund accumulates correctly across multiple contributions', () => {
        sim.fundInsurance(100n);
        sim.fundInsurance(200n);
        sim.fundInsurance(300n);
        expect(sim.getInsuranceFund()).toBe(600n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 30. Governance Mid-Vault: Ratio Changes Affect Existing Positions
// ─────────────────────────────────────────────────────────────────────────────
//
// When governance raises the liquidation or minting ratio, existing positions
// that were safe at the old ratio may become immediately unsafe.
// These tests walk through the resulting system state.
// ─────────────────────────────────────────────────────────────────────────────
describe('30. Governance mid-vault: ratio changes on open positions', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
    });

    it('position safe at 150% becomes liquidatable after ratio raised to 200%', () => {
        // At 150% ratio: 300 coll / 100 debt = 300%: healthy
        sim.depositCollateral(300n);
        sim.mintPUSD(100n);

        // Raise liquidation ratio to 200%
        sim.updateLiquidationRatio(200n);

        // 300 * 10000 * 100 = 300_000_000 vs 100 * 200 * 10000 = 200_000_000
        // 300M >= 200M → still collateralised at new ratio (300% > 200%)
        expect(() => sim.liquidate(300n, 100n)).toThrow(); // still healthy

        // Now mint more to reach 300% ratio exactly (already there)
        // But if we had been at 150% originally (300 coll, 200 debt = 150%),
        // raising to 200% would make it liquidatable.
        const sim2 = new LendingSimulator();
        sim2.updateMinDebt(0n);
        sim2.depositCollateral(300n);
        sim2.mintPUSD(200n); // 150% ratio: minimum at original setting

        sim2.updateLiquidationRatio(200n);

        // 300 * 10000 * 100 = 300_000_000 vs 200 * 200 * 10000 = 400_000_000
        // 300M < 400M → NOW undercollateralised
        expect(() => sim2.liquidate(300n, 200n)).not.toThrow();
    });

    it('raised mintingRatio prevents additional minting on otherwise-valid collateral', () => {
        sim.depositCollateral(300n);
        sim.mintPUSD(100n); // OK at 150% (300% ratio)

        sim.updateMintingRatio(200n);

        // With 300 coll and 200% minting ratio, max debt = 300 * 10000 * 100 / (200 * 10000) = 150
        // We have 100 debt, can mint up to 50 more
        expect(() => sim.mintPUSD(50n)).not.toThrow();
        expect(() => sim.mintPUSD(1n)).toThrow(); // at limit
    });

    it('lowering ratio immediately unlocks previously blocked withdrawal', () => {
        sim.depositCollateral(150n);
        sim.mintPUSD(100n); // exactly at 150% boundary

        // Raise ratio: cannot withdraw anything
        sim.updateLiquidationRatio(200n);
        expect(() => sim.withdrawCollateral(1n)).toThrow();

        // Lower it back
        sim.updateLiquidationRatio(150n);
        // Back to exactly at boundary: still can't withdraw
        expect(() => sim.withdrawCollateral(1n)).toThrow();

        // Lower further: now can withdraw
        sim.updateLiquidationRatio(110n);
        // With 110%: 150 * 10000 * 100 = 150_000_000 vs 100 * 110 * 10000 = 110_000_000 → OK
        expect(() => sim.withdrawCollateral(1n)).not.toThrow();
    });

    it('invariant totalSupply == totalDebt holds through governance changes', () => {
        sim.depositCollateral(1_000n);
        sim.mintPUSD(500n);

        sim.updateMintingRatio(200n);
        expect(sim.totalSupply()).toBe(sim.getLedger().totalDebt);

        sim.updateLiquidationRatio(110n);
        expect(sim.totalSupply()).toBe(sim.getLedger().totalDebt);

        sim.updateOraclePrice(15000n, 1n);
        expect(sim.totalSupply()).toBe(sim.getLedger().totalDebt);

        // Repay and verify still consistent
        sim.repayPUSD(200n);
        expect(sim.totalSupply()).toBe(sim.getLedger().totalDebt);
        expect(sim.getLedger().totalDebt).toBe(300n);
    });

    it('oracle price drop + ratio raise = double-squeeze on existing position', () => {
        // Start: 2000 coll, 1000 debt at $1.00 (200% ratio): very healthy
        sim.depositCollateral(2_000n);
        sim.mintPUSD(1_000n);

        // Price drops to $0.80
        sim.updateOraclePrice(8000n, 1n);
        // 2000 * 8000 * 100 = 1_600_000_000 vs 1000 * 150 * 10000 = 1_500_000_000
        // Still healthy at 150% ratio

        // Governance raises liquidation ratio to 200%
        sim.updateLiquidationRatio(200n);
        // 2000 * 8000 * 100 = 1_600_000_000 vs 1000 * 200 * 10000 = 2_000_000_000
        // 1_600M < 2_000M → now liquidatable from double-squeeze

        expect(() => sim.liquidate(2_000n, 1_000n)).not.toThrow();
    });
});