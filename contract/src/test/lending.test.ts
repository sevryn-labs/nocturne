import { LendingSimulator } from './lending-simulator.js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect, beforeEach } from 'vitest';

setNetworkId('undeployed');

const DUMMY_KEY_1 = { bytes: new Uint8Array(32).fill(1) };
const DUMMY_KEY_2 = { bytes: new Uint8Array(32).fill(2) };

const MAX_UINT128 = 340282366920938463463374607431768211455n;

// Default oracle price: $1.00 = 10000 in 4-decimal precision
const PRICE_ONE_USD = 10000n;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Contract Initialization
// ─────────────────────────────────────────────────────────────────────────────
describe('1. Contract Initialization', () => {
    it('initializes with expected public state zeroes', () => {
        const sim = new LendingSimulator();
        const state = sim.getLedger();

        expect(state.totalCollateral).toBe(0n);
        expect(state.totalDebt).toBe(0n);
        expect(state._totalSupply).toBe(0n);
    });

    it('initializes token metadata correctly', () => {
        const sim = new LendingSimulator();
        expect(sim.decimals()).toBe(18n);
        expect(sim.totalSupply()).toBe(0n);
    });

    it('initializes with zero token balances and allowances', () => {
        const sim = new LendingSimulator();
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(0n);
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(0n);
        expect(sim.allowance(sim.getOwnPublicKey(), DUMMY_KEY_1)).toBe(0n);
    });

    it('initializes risk parameters correctly', () => {
        const sim = new LendingSimulator();
        const state = sim.getLedger();
        expect(state.liquidationRatio).toBe(150n);
        expect(state.mintingRatio).toBe(150n);
        expect(state.oraclePrice).toBe(PRICE_ONE_USD);
        expect(state.debtCeiling).toBe(10000000n);
        expect(state.minDebt).toBe(100n);
        expect(state.liquidationPenalty).toBe(1300n);
        expect(state.paused).toBe(0n);
    });

    it('initializes oracle state correctly', () => {
        const sim = new LendingSimulator();
        expect(sim.getOraclePrice()).toBe(PRICE_ONE_USD);
        expect(sim.getOracleTimestamp()).toBe(0n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Collateral Management (depositCollateral)
// ─────────────────────────────────────────────────────────────────────────────
describe('2. Collateral Management (depositCollateral)', () => {
    let sim: LendingSimulator;
    beforeEach(() => { sim = new LendingSimulator(); });

    it('handles exactly 1 deposit', () => {
        sim.depositCollateral(1n);
        expect(sim.getLedger().totalCollateral).toBe(1n);
    });

    it('handles large value deposit', () => {
        sim.depositCollateral(10_000n);
        expect(sim.getLedger().totalCollateral).toBe(10_000n);
    });

    it('handles multiple deposits correctly', () => {
        sim.depositCollateral(10n);
        sim.depositCollateral(20n);
        expect(sim.getLedger().totalCollateral).toBe(30n);
        expect(sim.getPrivateState().collateralAmount).toBe(30n);
    });

    it('rejects a zero deposit', () => {
        expect(() => sim.depositCollateral(0n)).toThrow();
    });

    it('does not alter token supply or debt when depositing', () => {
        sim.depositCollateral(1_000n);
        expect(sim.totalSupply()).toBe(0n);
        expect(sim.getLedger().totalDebt).toBe(0n);
    });

    it('allows deposits even when protocol is paused', () => {
        sim.setPaused(1n);
        expect(() => sim.depositCollateral(1_000n)).not.toThrow();
        expect(sim.getLedger().totalCollateral).toBe(1_000n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Minting Tests (mintPUSD)
// ─────────────────────────────────────────────────────────────────────────────
describe('3. Minting Tests (mintPUSD)', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        // Set minDebt to 0 for legacy mint tests to pass without dust constraints
        sim.updateMinDebt(0n);
    });

    it('mints valid limits (10 deposit -> 5 mint = 200%)', () => {
        sim.depositCollateral(10n);
        sim.mintPUSD(5n);
        expect(sim.getPrivateState().debtAmount).toBe(5n);
        expect(sim.getLedger().totalDebt).toBe(5n);
        expect(sim.totalSupply()).toBe(5n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(5n);
    });

    it('mints up to exact boundary (150% ratio)', () => {
        sim.depositCollateral(150n);
        expect(() => sim.mintPUSD(100n)).not.toThrow();
        expect(sim.totalSupply()).toBe(100n);
    });

    it('fails to mint strictly above boundary limit', () => {
        sim.depositCollateral(150n);
        expect(() => sim.mintPUSD(101n)).toThrow();
    });

    it('fails to mint without collateral', () => {
        expect(() => sim.mintPUSD(1n)).toThrow();
    });

    it('fails to mint zero amount', () => {
        sim.depositCollateral(100n);
        expect(() => sim.mintPUSD(0n)).toThrow();
    });

    it('fails to mint when protocol is paused', () => {
        sim.depositCollateral(1_000n);
        sim.setPaused(1n);
        expect(() => sim.mintPUSD(100n)).toThrow(/paused/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Repayment Tests (repayPUSD)
// ─────────────────────────────────────────────────────────────────────────────
describe('4. Repayment Tests (repayPUSD)', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
        sim.depositCollateral(10_000n);
        sim.mintPUSD(5_000n);
    });

    it('allows partial repayment', () => {
        sim.repayPUSD(2_000n);
        expect(sim.totalSupply()).toBe(3_000n);
        expect(sim.getLedger().totalDebt).toBe(3_000n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(3_000n);
        expect(sim.getPrivateState().debtAmount).toBe(3_000n);
    });

    it('allows complete full repayment', () => {
        sim.repayPUSD(5_000n);
        expect(sim.totalSupply()).toBe(0n);
        expect(sim.getLedger().totalDebt).toBe(0n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(0n);
    });

    it('fails when repaying 0', () => {
        expect(() => sim.repayPUSD(0n)).toThrow();
    });

    it('fails when repaying more than private debt', () => {
        expect(() => sim.repayPUSD(5_001n)).toThrow();
    });

    it('fails when repaying more tokens than caller actually holds', () => {
        sim.transfer(DUMMY_KEY_1, 5_000n);
        expect(() => sim.repayPUSD(1n)).toThrow(/insufficient balance|exceeds balance|overflow/i);
    });

    it('allows repayment even when protocol is paused', () => {
        sim.setPaused(1n);
        expect(() => sim.repayPUSD(1_000n)).not.toThrow();
        expect(sim.getLedger().totalDebt).toBe(4_000n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Withdraw Collateral Tests (withdrawCollateral)
// ─────────────────────────────────────────────────────────────────────────────
describe('5. Withdraw Collateral Tests (withdrawCollateral)', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
    });

    it('allows partial withdrawal with no debt', () => {
        sim.depositCollateral(10n);
        sim.withdrawCollateral(5n);
        expect(sim.getLedger().totalCollateral).toBe(5n);
    });

    it('allows withdrawal keeping ratio exactly >= 150%', () => {
        sim.depositCollateral(300n);
        sim.mintPUSD(100n);
        expect(() => sim.withdrawCollateral(150n)).not.toThrow();
    });

    it('fails withdrawal if resulting ratio < 150%', () => {
        sim.depositCollateral(300n);
        sim.mintPUSD(100n);
        expect(() => sim.withdrawCollateral(151n)).toThrow();
    });

    it('fails withdrawal exceeding collateral', () => {
        sim.depositCollateral(10n);
        expect(() => sim.withdrawCollateral(11n)).toThrow();
    });

    it('fails zero withdrawal', () => {
        sim.depositCollateral(10n);
        expect(() => sim.withdrawCollateral(0n)).toThrow();
    });

    it('fails withdrawal when protocol is paused', () => {
        sim.depositCollateral(1_000n);
        sim.setPaused(1n);
        expect(() => sim.withdrawCollateral(100n)).toThrow(/paused/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Liquidation Tests (liquidate)
// ─────────────────────────────────────────────────────────────────────────────
describe('6. Liquidation Tests (liquidate)', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
    });

    it('executes valid liquidation when liquidator holds required pUSD', () => {
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        sim.depositCollateral(100n);

        expect(() => sim.liquidate(100n, 70n)).not.toThrow();
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(930n);
        expect(sim.totalSupply()).toBe(930n);
        expect(sim.getLedger().totalCollateral).toBe(3_000n);
    });

    it('fails to liquidate healthy position', () => {
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        expect(() => sim.liquidate(150n, 100n)).toThrow();
    });

    it('fails to liquidate if liquidator lacks required pUSD tokens', () => {
        expect(() => sim.liquidate(100n, 70n)).toThrow(/insufficient balance|exceeds balance/i);
    });

    it('fails to liquidate with 0 amounts', () => {
        sim.depositCollateral(1_000n);
        sim.mintPUSD(500n);
        expect(() => sim.liquidate(0n, 100n)).toThrow();
        expect(() => sim.liquidate(100n, 0n)).toThrow();
    });

    it('fails to liquidate when protocol is paused', () => {
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        sim.setPaused(1n);
        expect(() => sim.liquidate(100n, 70n)).toThrow(/paused/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Token Transfer Tests (transfer)
// ─────────────────────────────────────────────────────────────────────────────
describe('7. Token Transfer Tests (transfer)', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
        sim.depositCollateral(10_000n);
        sim.mintPUSD(5_00n);
    });

    it('successfully transfers tokens and updates balances correctly', () => {
        const res = sim.transfer(DUMMY_KEY_1, 2_00n);
        expect(res).toBe(true);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(3_00n);
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(2_00n);
    });

    it('keeps total supply invariant during transfer', () => {
        sim.transfer(DUMMY_KEY_1, 2_00n);
        expect(sim.totalSupply()).toBe(5_00n);
        expect(sim.getLedger().totalDebt).toBe(5_00n);
    });

    it('fails when transferring 0', () => {
        expect(() => sim.transfer(DUMMY_KEY_1, 0n)).toThrow();
    });

    it('allows transferring entire balance', () => {
        sim.transfer(DUMMY_KEY_1, 5_00n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(0n);
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(5_00n);
    });

    it('fails transferring more than available balance', () => {
        expect(() => sim.transfer(DUMMY_KEY_1, 5_01n)).toThrow();
    });

    it('allows self-transfers (balances remain the same)', () => {
        sim.transfer(sim.getOwnPublicKey(), 2_00n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(5_00n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 8. Allowance + Approval Tests (approve)
// ─────────────────────────────────────────────────────────────────────────────
describe('8. Allowance + Approval Tests (approve)', () => {
    let sim: LendingSimulator;
    beforeEach(() => { sim = new LendingSimulator(); });

    it('updates allowance correctly', () => {
        sim.approve(DUMMY_KEY_1, 5n);
        expect(sim.allowance(sim.getOwnPublicKey(), DUMMY_KEY_1)).toBe(5n);
    });

    it('allows replacing allowance values (overwrite)', () => {
        sim.approve(DUMMY_KEY_1, 50n);
        sim.approve(DUMMY_KEY_1, 20n);
        expect(sim.allowance(sim.getOwnPublicKey(), DUMMY_KEY_1)).toBe(20n);
    });

    it('allows clearing allowance (set to 0) or initial 0', () => {
        sim.approve(DUMMY_KEY_1, 0n);
        expect(sim.allowance(sim.getOwnPublicKey(), DUMMY_KEY_1)).toBe(0n);
    });

    it('allows approving strictly to the max uint128', () => {
        sim.approve(DUMMY_KEY_1, MAX_UINT128);
        expect(sim.allowance(sim.getOwnPublicKey(), DUMMY_KEY_1)).toBe(MAX_UINT128);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 9. transferFrom Tests (transferFrom)
// ─────────────────────────────────────────────────────────────────────────────
describe('9. transferFrom Tests (transferFrom)', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
        sim.depositCollateral(10_000n);
        sim.mintPUSD(1_000n);
    });

    it('allows spender to transfer exactly the allowed amount', () => {
        sim.approve(sim.getOwnPublicKey(), 300n);
        sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 300n);
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(300n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(700n);
        expect(sim.allowance(sim.getOwnPublicKey(), sim.getOwnPublicKey())).toBe(0n);
    });

    it('does not reduce allowance if it is exactly MAX_UINT128 (infinite allowance)', () => {
        sim.approve(sim.getOwnPublicKey(), MAX_UINT128);
        sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 300n);
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(300n);
        expect(sim.allowance(sim.getOwnPublicKey(), sim.getOwnPublicKey())).toBe(MAX_UINT128);
    });

    it('fails when transferFrom amount exceeds allowance', () => {
        sim.approve(sim.getOwnPublicKey(), 300n);
        expect(() => sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 301n)).toThrow();
    });

    it('fails when transferFrom amount exceeds balance, even if allowance exists', () => {
        sim.approve(sim.getOwnPublicKey(), 5_000n);
        expect(() => sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 1_001n)).toThrow();
    });

    it('fails transferFrom zero amount', () => {
        sim.approve(sim.getOwnPublicKey(), 100n);
        expect(() => sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 0n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 10. Multi-user System Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('10. Multi-user System Tests', () => {
    it('maintains independent balances and totals for interactions', () => {
        const sim = new LendingSimulator();
        sim.updateMinDebt(0n);
        sim.depositCollateral(10_00n);
        sim.mintPUSD(5_00n);
        sim.transfer(DUMMY_KEY_1, 3_00n);

        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(2_00n);
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(3_00n);
        expect(sim.totalSupply()).toBe(5_00n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Protocol Invariant Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('11. Protocol Invariant Tests', () => {
    it('always preserves totalSupply == totalDebt directly in ledger states', () => {
        const sim = new LendingSimulator();
        sim.updateMinDebt(0n);

        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();

        sim.depositCollateral(200n);
        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();

        sim.mintPUSD(100n);
        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();
        expect(sim.getLedger().totalDebt).toBe(100n);

        sim.transfer(DUMMY_KEY_1, 50n);
        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();

        sim.repayPUSD(50n);
        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();
        expect(sim.getLedger().totalDebt).toBe(50n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Sequential Workflow Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('12. Sequential Workflow Tests', () => {
    it('Deposit -> Mint -> Transfer -> Repay -> Withdraw flow', () => {
        const sim = new LendingSimulator();
        sim.updateMinDebt(0n);

        sim.depositCollateral(10_000n);
        expect(sim.getLedger().totalCollateral).toBe(10_000n);

        sim.mintPUSD(2_000n);
        expect(sim.getLedger().totalDebt).toBe(2_000n);
        expect(sim.getPrivateState().debtAmount).toBe(2_000n);

        sim.transfer(DUMMY_KEY_1, 500n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(1_500n);
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(500n);

        sim.repayPUSD(1_500n);
        expect(sim.getPrivateState().debtAmount).toBe(500n);
        expect(sim.totalSupply()).toBe(500n);

        sim.withdrawCollateral(1_000n);
        expect(sim.getLedger().totalCollateral).toBe(9_000n);
    });

    it('Deposit -> Mint -> Liquidate flow', () => {
        const sim = new LendingSimulator();
        sim.updateMinDebt(0n);

        sim.depositCollateral(5_000n);
        sim.mintPUSD(100n);

        sim.depositCollateral(100n);

        expect(() => sim.liquidate(100n, 90n)).not.toThrow();
        expect(sim.getLedger().totalCollateral).toBe(5_000n);
        expect(sim.totalSupply()).toBe(10n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(10n);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 13. Boundary Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('13. Boundary Tests', () => {
    it('exact limit liquidation', () => {
        const sim = new LendingSimulator();
        sim.updateMinDebt(0n);
        sim.depositCollateral(10_000n);
        sim.mintPUSD(200n);

        sim.depositCollateral(150n);
        expect(() => sim.liquidate(150n, 100n)).toThrow(); // Healthy

        sim.depositCollateral(149n);
        expect(() => sim.liquidate(149n, 100n)).not.toThrow(); // Liquidatable
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 14. Randomized / Fuzz Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('14. Randomized / Fuzz Tests', () => {
    it('preserves invariants over a random sequence of simulated calls', () => {
        const sim = new LendingSimulator();
        sim.updateMinDebt(0n);

        sim.depositCollateral(20_000n);
        sim.mintPUSD(5_000n);
        sim.transfer(DUMMY_KEY_1, 1_000n);
        sim.approve(sim.getOwnPublicKey(), 1_000n);
        sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_2, 500n);
        sim.withdrawCollateral(1_000n);
        sim.depositCollateral(1_000n);
        sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 500n);
        sim.repayPUSD(3_000n);

        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(0n);
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(1_500n);
        expect(sim.balanceOf(DUMMY_KEY_2)).toBe(500n);
        expect(sim.getLedger().totalDebt).toBe(2_000n);
        expect(sim.getLedger().totalCollateral).toBe(20_000n);
    });
});

// ═════════════════════════════════════════════════════════════════════════════
// v3 NEW TEST SECTIONS
// ═════════════════════════════════════════════════════════════════════════════

// ─────────────────────────────────────────────────────────────────────────────
// 15. Oracle Price Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('15. Oracle Price Tests', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
    });

    it('initializes oracle to $1.00', () => {
        expect(sim.getOraclePrice()).toBe(PRICE_ONE_USD);
    });

    it('allows updating oracle price', () => {
        sim.updateOraclePrice(15000n, 100n); // $1.50
        expect(sim.getOraclePrice()).toBe(15000n);
        expect(sim.getOracleTimestamp()).toBe(100n);
    });

    it('rejects zero price', () => {
        expect(() => sim.updateOraclePrice(0n, 100n)).toThrow();
    });

    it('rejects decreasing block height', () => {
        sim.updateOraclePrice(10000n, 100n);
        expect(() => sim.updateOraclePrice(10000n, 50n)).toThrow();
    });

    it('oracle price affects minting capacity', () => {
        sim.depositCollateral(100n);

        // At $1.00, can mint up to 66.6 pUSD (100 * 10000 * 100 >= debt * 150 * 10000)
        expect(() => sim.mintPUSD(66n)).not.toThrow();
        sim.repayPUSD(66n);

        // At $2.00, can mint up to 133.3 pUSD
        sim.updateOraclePrice(20000n, 1n); // $2.00
        expect(() => sim.mintPUSD(133n)).not.toThrow();
        sim.repayPUSD(133n);

        // At $0.50, can mint up to 33.3 pUSD
        sim.updateOraclePrice(5000n, 2n); // $0.50
        expect(() => sim.mintPUSD(34n)).toThrow(); // Over boundary
        expect(() => sim.mintPUSD(33n)).not.toThrow();
    });

    it('oracle price affects liquidation threshold', () => {
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);

        // At $1.00, ratio = 3000*10000*100 / (1000*150*10000) = 200%. Healthy.
        expect(() => sim.liquidate(150n, 100n)).toThrow(); // Healthy at $1.00

        // Drop price to $0.50 → victim with 150 collateral, 100 debt
        // 150 * 5000 * 100 = 75_000_000 vs 100 * 150 * 10000 = 150_000_000
        // 75M < 150M → undercollateralised
        sim.updateOraclePrice(5000n, 1n);
        expect(() => sim.liquidate(150n, 100n)).not.toThrow();
    });

    it('oracle price affects withdrawal safety', () => {
        sim.depositCollateral(300n);
        sim.mintPUSD(100n);

        // At $1.00, can withdraw 150 (keeping ratio at exactly 150%)
        expect(() => sim.withdrawCollateral(150n)).not.toThrow();
        sim.depositCollateral(150n);

        // At $0.50, need 300 collateral to support 100 debt at 150%
        // 300 * 5000 * 100 = 150_000_000 vs 100 * 150 * 10000 = 150_000_000 (exact boundary)
        sim.updateOraclePrice(5000n, 1n);
        expect(() => sim.withdrawCollateral(1n)).toThrow(); // Can't withdraw ANY at $0.50
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 16. Debt Ceiling Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('16. Debt Ceiling Tests', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
        sim.updateMinDebt(0n);
    });

    it('enforces debt ceiling on minting', () => {
        sim.updateDebtCeiling(1_000n);
        sim.depositCollateral(5_000n);

        expect(() => sim.mintPUSD(1_000n)).not.toThrow(); // Exactly at ceiling
    });

    it('rejects minting above debt ceiling', () => {
        sim.updateDebtCeiling(1_000n);
        sim.depositCollateral(5_000n);

        expect(() => sim.mintPUSD(1_001n)).toThrow();
    });

    it('allows updating debt ceiling', () => {
        sim.updateDebtCeiling(500n);
        expect(sim.getDebtCeiling()).toBe(500n);

        sim.updateDebtCeiling(2_000n);
        expect(sim.getDebtCeiling()).toBe(2_000n);
    });

    it('rejects zero debt ceiling', () => {
        expect(() => sim.updateDebtCeiling(0n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 17. Minimum Debt Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('17. Minimum Debt Tests', () => {
    let sim: LendingSimulator;
    beforeEach(() => { sim = new LendingSimulator(); });

    it('enforces minimum debt on first mint', () => {
        sim.depositCollateral(1_000n);
        // Default minDebt = 100
        expect(() => sim.mintPUSD(99n)).toThrow();
        expect(() => sim.mintPUSD(100n)).not.toThrow();
    });

    it('allows updating minimum debt', () => {
        sim.updateMinDebt(50n);
        expect(sim.getMinDebt()).toBe(50n);

        sim.depositCollateral(1_000n);
        expect(() => sim.mintPUSD(50n)).not.toThrow();
    });

    it('allows setting minimum debt to zero', () => {
        sim.updateMinDebt(0n);
        sim.depositCollateral(100n);
        expect(() => sim.mintPUSD(1n)).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 18. Pause Mechanism Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('18. Pause Mechanism Tests', () => {
    let sim: LendingSimulator;
    beforeEach(() => { sim = new LendingSimulator(); });

    it('can pause and unpause protocol', () => {
        sim.setPaused(1n);
        expect(sim.getPausedState()).toBe(1n);

        sim.setPaused(0n);
        expect(sim.getPausedState()).toBe(0n);
    });

    it('rejects invalid pause state', () => {
        expect(() => sim.setPaused(2n)).toThrow();
    });

    it('blocks minting when paused', () => {
        sim.updateMinDebt(0n);
        sim.depositCollateral(1_000n);
        sim.setPaused(1n);
        expect(() => sim.mintPUSD(100n)).toThrow(/paused/i);
    });

    it('blocks withdrawals when paused', () => {
        sim.depositCollateral(1_000n);
        sim.setPaused(1n);
        expect(() => sim.withdrawCollateral(100n)).toThrow(/paused/i);
    });

    it('blocks liquidations when paused', () => {
        sim.updateMinDebt(0n);
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        sim.setPaused(1n);
        expect(() => sim.liquidate(100n, 70n)).toThrow(/paused/i);
    });

    it('allows deposits when paused (risk-reducing)', () => {
        sim.setPaused(1n);
        expect(() => sim.depositCollateral(1_000n)).not.toThrow();
    });

    it('allows repayments when paused (risk-reducing)', () => {
        sim.updateMinDebt(0n);
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        sim.setPaused(1n);
        expect(() => sim.repayPUSD(500n)).not.toThrow();
    });

    it('blocks transfers when paused', () => {
        sim.updateMinDebt(0n);
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);
        sim.setPaused(1n);
        expect(() => sim.transfer(DUMMY_KEY_1, 100n)).toThrow(/paused/i);
    });

    it('resumes all operations after unpause', () => {
        sim.updateMinDebt(0n);
        sim.depositCollateral(3_000n);
        sim.setPaused(1n);
        sim.setPaused(0n);

        expect(() => sim.mintPUSD(100n)).not.toThrow();
        expect(() => sim.withdrawCollateral(100n)).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 19. Insurance Fund Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('19. Insurance Fund Tests', () => {
    let sim: LendingSimulator;
    beforeEach(() => { sim = new LendingSimulator(); });

    it('starts at zero', () => {
        expect(sim.getInsuranceFund()).toBe(0n);
    });

    it('allows funding insurance', () => {
        sim.fundInsurance(1_000n);
        expect(sim.getInsuranceFund()).toBe(1_000n);
    });

    it('allows multiple insurance contributions', () => {
        sim.fundInsurance(500n);
        sim.fundInsurance(300n);
        expect(sim.getInsuranceFund()).toBe(800n);
    });

    it('rejects zero insurance funding', () => {
        expect(() => sim.fundInsurance(0n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 20. Governance Parameter Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('20. Governance Parameter Tests', () => {
    let sim: LendingSimulator;
    beforeEach(() => { sim = new LendingSimulator(); });

    it('allows updating minting ratio within bounds', () => {
        sim.updateMintingRatio(200n);
        expect(sim.getLedger().mintingRatio).toBe(200n);
    });

    it('rejects minting ratio below 110%', () => {
        expect(() => sim.updateMintingRatio(109n)).toThrow();
    });

    it('rejects minting ratio above 300%', () => {
        expect(() => sim.updateMintingRatio(301n)).toThrow();
    });

    it('allows updating liquidation ratio within bounds', () => {
        sim.updateLiquidationRatio(120n);
        expect(sim.getLedger().liquidationRatio).toBe(120n);
    });

    it('rejects liquidation ratio below 110%', () => {
        expect(() => sim.updateLiquidationRatio(109n)).toThrow();
    });

    it('allows updating liquidation penalty within bounds', () => {
        sim.updateLiquidationPenalty(500n);    // 5%
        expect(sim.getLiquidationPenalty()).toBe(500n);

        sim.updateLiquidationPenalty(2500n);   // 25%
        expect(sim.getLiquidationPenalty()).toBe(2500n);
    });

    it('rejects liquidation penalty outside bounds', () => {
        expect(() => sim.updateLiquidationPenalty(499n)).toThrow();
        expect(() => sim.updateLiquidationPenalty(2501n)).toThrow();
    });

    it('allows updating staleness limit within bounds', () => {
        sim.updateStalenessLimit(10n);
        sim.updateStalenessLimit(10000n);
    });

    it('rejects staleness limit outside bounds', () => {
        expect(() => sim.updateStalenessLimit(9n)).toThrow();
        expect(() => sim.updateStalenessLimit(10001n)).toThrow();
    });

    it('governance changes affect ratio enforcement', () => {
        sim.updateMinDebt(0n);
        sim.depositCollateral(200n);

        // At 150% ratio: can mint 133 max
        expect(() => sim.mintPUSD(133n)).not.toThrow();
        sim.repayPUSD(133n);

        // Change to 200% ratio: can mint 100 max
        sim.updateMintingRatio(200n);
        expect(() => sim.mintPUSD(101n)).toThrow();
        expect(() => sim.mintPUSD(100n)).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 21. Oracle-Integrated Stress Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('21. Oracle-Integrated Stress Tests', () => {
    it('price drop makes previously safe position liquidatable', () => {
        const sim = new LendingSimulator();
        sim.updateMinDebt(0n);

        // Setup: 1500 collateral, 1000 debt at $1.00 (exactly 150%)
        sim.depositCollateral(1500n);
        sim.mintPUSD(1000n);

        // Healthy at $1.00
        // 1500 * 10000 * 100 = 1_500_000_000 vs 1000 * 150 * 10000 = 1_500_000_000 → NOT < → healthy
        expect(() => sim.liquidate(1500n, 1000n)).toThrow();

        // Drop price to $0.99
        sim.updateOraclePrice(9900n, 1n);
        // 1500 * 9900 * 100 = 1_485_000_000 vs 1000 * 150 * 10000 = 1_500_000_000
        // 1_485M < 1_500M → undercollateralised!
        expect(() => sim.liquidate(1500n, 1000n)).not.toThrow();
    });

    it('price increase allows more minting', () => {
        const sim = new LendingSimulator();
        sim.updateMinDebt(0n);

        sim.depositCollateral(100n);

        // At $1.00: max mint = 100 * 10000 * 100 / (150 * 10000) = 66.6 → 66
        sim.mintPUSD(66n);
        sim.repayPUSD(66n);

        // At $3.00: max mint = 100 * 30000 * 100 / (150 * 10000) = 200
        sim.updateOraclePrice(30000n, 1n);
        expect(() => sim.mintPUSD(200n)).not.toThrow();
    });

    it('full lifecycle with price changes', () => {
        const sim = new LendingSimulator();
        sim.updateMinDebt(0n);

        // 1. Deposit 1000 tNight
        sim.depositCollateral(1000n);

        // 2. Oracle at $2.00 → max debt = 1000 * 20000 * 100 / (150 * 10000) = 1333
        sim.updateOraclePrice(20000n, 1n);
        sim.mintPUSD(1000n);

        // 3. Price drops to $1.50 → ratio = 1000 * 15000 / (1000 * 150 * 100) = 100%
        // That means 1000 * 15000 * 100 = 1_500_000_000 vs 1000 * 150 * 10000 = 1_500_000_000
        // Exactly at boundary → NOT liquidatable (need strictly less)
        sim.updateOraclePrice(15000n, 2n);
        expect(() => sim.liquidate(1000n, 1000n)).toThrow();

        // 4. Price drops to $1.49 → below threshold
        sim.updateOraclePrice(14900n, 3n);
        // 1000 * 14900 * 100 = 1_490_000_000 < 1000 * 150 * 10000 = 1_500_000_000 → liquidatable
        expect(() => sim.liquidate(1000n, 1000n)).not.toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 22. Combined System Integrity Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('22. Combined System Integrity Tests', () => {
    it('debt ceiling + oracle price + min debt all enforced together', () => {
        const sim = new LendingSimulator();

        sim.updateDebtCeiling(500n);
        sim.updateMinDebt(100n);
        sim.updateOraclePrice(20000n, 1n); // $2.00

        sim.depositCollateral(1_000n);

        // Min debt check: 50 < 100 → fail
        expect(() => sim.mintPUSD(50n)).toThrow();

        // Ratio check: with $2.00 price, 1000 collateral supports up to 1333 debt
        // But ceiling is 500 → max 500
        expect(() => sim.mintPUSD(500n)).not.toThrow();

        // Ceiling reached → can't mint more
        expect(() => sim.mintPUSD(100n)).toThrow();
    });

    it('invariants hold through governance changes', () => {
        const sim = new LendingSimulator();
        sim.updateMinDebt(0n);

        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);

        // totalSupply == totalDebt
        expect(sim.totalSupply()).toBe(sim.getLedger().totalDebt);

        // Change ratio
        sim.updateMintingRatio(200n);

        // Still consistent
        expect(sim.totalSupply()).toBe(sim.getLedger().totalDebt);

        // Can't mint as much now (need 200% ratio)
        // Current: 3000 coll, 1000 debt. Max debt at 200% = 3000*10000*100/(200*10000) = 1500
        sim.mintPUSD(500n);
        expect(() => sim.mintPUSD(1n)).toThrow();

        expect(sim.totalSupply()).toBe(sim.getLedger().totalDebt);
        expect(sim.getLedger().totalDebt).toBe(1_500n);
    });
});
