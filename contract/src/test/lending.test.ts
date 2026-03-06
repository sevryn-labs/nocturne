import { LendingSimulator } from './lending-simulator.js';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { describe, it, expect, beforeEach } from 'vitest';

setNetworkId('undeployed');

const DUMMY_KEY_1 = { bytes: new Uint8Array(32).fill(1) };
const DUMMY_KEY_2 = { bytes: new Uint8Array(32).fill(2) };

// Maximum possible Uint128 for infinite allowance tests
const MAX_UINT128 = 340282366920938463463374607431768211455n;

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
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Minting Tests (mintPUSD)
// ─────────────────────────────────────────────────────────────────────────────
describe('3. Minting Tests (mintPUSD)', () => {
    let sim: LendingSimulator;
    beforeEach(() => { sim = new LendingSimulator(); });

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
        // Minting 101 gives a ratio of 148.5%
        expect(() => sim.mintPUSD(101n)).toThrow();
    });

    it('fails to mint without collateral', () => {
        expect(() => sim.mintPUSD(1n)).toThrow();
    });

    it('fails to mint zero amount', () => {
        sim.depositCollateral(100n);
        expect(() => sim.mintPUSD(0n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Repayment Tests (repayPUSD)
// ─────────────────────────────────────────────────────────────────────────────
describe('4. Repayment Tests (repayPUSD)', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
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
        // Alice transfers away her tokens so she cannot repay
        sim.transfer(DUMMY_KEY_1, 5_000n);
        // Debt is still 5000, but Alice has 0 pUSD internally to burn
        expect(() => sim.repayPUSD(1n)).toThrow(/insufficient balance|exceeds balance|overflow/i);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Withdraw Collateral Tests (withdrawCollateral)
// ─────────────────────────────────────────────────────────────────────────────
describe('5. Withdraw Collateral Tests (withdrawCollateral)', () => {
    let sim: LendingSimulator;
    beforeEach(() => { sim = new LendingSimulator(); });

    it('allows partial withdrawal with no debt', () => {
        sim.depositCollateral(10n);
        sim.withdrawCollateral(5n);
        expect(sim.getLedger().totalCollateral).toBe(5n);
    });

    it('allows withdrawal keeping ratio exactly >= 150%', () => {
        sim.depositCollateral(300n);
        sim.mintPUSD(100n);
        // Ratio is 300%. Can withdraw 150 to keep it exactly at 150%.
        expect(() => sim.withdrawCollateral(150n)).not.toThrow();
    });

    it('fails withdrawal if resulting ratio < 150%', () => {
        sim.depositCollateral(300n);
        sim.mintPUSD(100n);
        // Withdraw 151 makes collateral 149 (ratio 149%)
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
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Liquidation Tests (liquidate)
// ─────────────────────────────────────────────────────────────────────────────
describe('6. Liquidation Tests (liquidate)', () => {
    let sim: LendingSimulator;
    beforeEach(() => { sim = new LendingSimulator(); });

    it('executes valid liquidation when liquidator holds required pUSD', () => {
        // 1. Give liquidator some tokens (liquidator is the `sim` user)
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n); // liquidator has 1000 pUSD balance

        // 2. Set up victim totals exactly in the global state (as if victim minted)
        // Victim has 100 collateral and 70 debt -> Ratio 142% (<150%)
        sim.depositCollateral(100n);
        // We modify global debt manually or through a dummy flow to simulate the victim
        // Actually, liquidate just checks (victimColl * 100) < (victimDebt * 150).
        // The liquidator burns 'victimDebt' from their own balance.

        expect(() => sim.liquidate(100n, 70n)).not.toThrow();

        // Liquidator balance decreases by 70
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(930n);
        // Supply decreases by 70
        expect(sim.totalSupply()).toBe(930n);
        // Collateral removed from total is 100
        expect(sim.getLedger().totalCollateral).toBe(3_000n); // 3100 - 100
    });

    it('fails to liquidate healthy position', () => {
        sim.depositCollateral(3_000n);
        sim.mintPUSD(1_000n);

        // Victim has 150 coll, 100 debt = 150% (Healthy)
        expect(() => sim.liquidate(150n, 100n)).toThrow();
    });

    it('fails to liquidate if liquidator lacks required pUSD tokens', () => {
        // Liquidator has 0 pUSD
        expect(() => sim.liquidate(100n, 70n)).toThrow(/insufficient balance|exceeds balance/i);
    });

    it('fails to liquidate with 0 amounts', () => {
        sim.depositCollateral(1_000n);
        sim.mintPUSD(500n);
        expect(() => sim.liquidate(0n, 100n)).toThrow();
        expect(() => sim.liquidate(100n, 0n)).toThrow();
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Token Transfer Tests (transfer)
// ─────────────────────────────────────────────────────────────────────────────
describe('7. Token Transfer Tests (transfer)', () => {
    let sim: LendingSimulator;
    beforeEach(() => {
        sim = new LendingSimulator();
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
        sim.depositCollateral(10_000n);
        sim.mintPUSD(1_000n);
    });

    it('allows spender to transfer exactly the allowed amount', () => {
        // Caller approves ITSELF as a spender to demonstrate transferFrom logic 
        // purely because the simulator binds the caller explicitly into the circuit context.
        sim.approve(sim.getOwnPublicKey(), 300n);

        // Caller (spender) moves from Owner (self) to recipient
        sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 300n);

        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(300n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(700n);
        // Allowance should correctly be reduced to 0
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
        sim.approve(sim.getOwnPublicKey(), 5_000n); // Approved 5000
        expect(() => sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 1_001n)).toThrow(); // Balance is 1000
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
    // Tests logical isolation and ledger updates referencing arbitrary user keys.
    it('maintains independent balances and totals for interactions', () => {
        const sim = new LendingSimulator();

        sim.depositCollateral(10_00n);
        sim.mintPUSD(5_00n);

        // Simulate Bob getting some tokens
        sim.transfer(DUMMY_KEY_1, 3_00n);

        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(2_00n); // Alice Private balance vs Public Tokens
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(3_00n);           // Bob's Public token balance
        expect(sim.totalSupply()).toBe(5_00n);                    // System still maintains correct invariant
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 11. Protocol Invariant Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('11. Protocol Invariant Tests', () => {
    it('always preserves totalSupply == totalDebt directly in ledger states', () => {
        const sim = new LendingSimulator();

        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();

        sim.depositCollateral(200n);

        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();

        sim.mintPUSD(100n); // mints pUSD

        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();
        expect(sim.getLedger().totalDebt).toBe(100n);

        sim.transfer(DUMMY_KEY_1, 50n);

        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();

        sim.repayPUSD(50n);

        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();
        expect(sim.getLedger().totalDebt).toBe(50n); // (100 - 50 = 50)
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// 12. Sequential Workflow Tests
// ─────────────────────────────────────────────────────────────────────────────
describe('12. Sequential Workflow Tests', () => {
    it('Deposit -> Mint -> Transfer -> Repay -> Withdraw flow', () => {
        const sim = new LendingSimulator();

        // 1. Deposit
        sim.depositCollateral(10_000n);
        expect(sim.getLedger().totalCollateral).toBe(10_000n);

        // 2. Mint
        sim.mintPUSD(2_000n);
        expect(sim.getLedger().totalDebt).toBe(2_000n);
        expect(sim.getPrivateState().debtAmount).toBe(2_000n);

        // 3. Alice pays Bob
        sim.transfer(DUMMY_KEY_1, 500n);
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(1_500n);
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(500n);

        // 4. Repay partial
        sim.repayPUSD(1_500n);
        expect(sim.getPrivateState().debtAmount).toBe(500n);
        expect(sim.totalSupply()).toBe(500n);

        // 5. Withdraw strictly safe collateral remaining
        sim.withdrawCollateral(1_000n);
        expect(sim.getLedger().totalCollateral).toBe(9_000n);
        // Check ratio: 9000 collat / 500 debt = 1800% > 150%
    });

    it('Deposit -> Mint -> Liquidate flow', () => {
        const sim = new LendingSimulator();

        // Liquidator provides 1. money and 2. mints to act as liquidation fuel
        sim.depositCollateral(5_000n);
        sim.mintPUSD(100n);

        // Setup Victim Context directly through standard testing
        sim.depositCollateral(100n); // Assume "Victim deposited 100"

        // Assert liquidator's successful cleanup of "Victim 100 Collat, 90 Debt"
        expect(() => sim.liquidate(100n, 90n)).not.toThrow();

        // 100 went missing from collateral
        expect(sim.getLedger().totalCollateral).toBe(5_000n);

        // 90 was reduced from Liquidator balance + totalSupply
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
        sim.depositCollateral(10_000n);
        sim.mintPUSD(200n);

        // Target: 150 collateral, 100 debt -> Exactly 150%. 
        sim.depositCollateral(150n);
        expect(() => sim.liquidate(150n, 100n)).toThrow(); // Healthy

        // Target: 149 collateral, 100 debt -> 149% -> Below threshold
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

        // Random series deterministic actions
        sim.depositCollateral(20_000n);
        sim.mintPUSD(5_000n);
        sim.transfer(DUMMY_KEY_1, 1_000n);
        sim.approve(sim.getOwnPublicKey(), 1_000n);
        sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_2, 500n);
        sim.withdrawCollateral(1_000n);
        sim.depositCollateral(1_000n);
        sim.transferFrom(sim.getOwnPublicKey(), DUMMY_KEY_1, 500n);

        // Return remaining supply balance
        sim.repayPUSD(3_000n);

        expect(sim.totalSupply() === sim.getLedger().totalDebt).toBeTruthy();
        expect(sim.balanceOf(sim.getOwnPublicKey())).toBe(0n);
        expect(sim.balanceOf(DUMMY_KEY_1)).toBe(1_500n);
        expect(sim.balanceOf(DUMMY_KEY_2)).toBe(500n);
        expect(sim.getLedger().totalDebt).toBe(2_000n);
        expect(sim.getLedger().totalCollateral).toBe(20_000n);
    });
});
