// pUSD Lending Protocol — In-Memory Test Simulator
//
// Wraps the Compact-generated contract in a helper class that lets unit tests
// call circuits in-memory without a network or proof server.
//
// Matches the generated Witnesses<PS> interface from Compact 0.20.x:
//   (context: WitnessContext<Ledger, PS>) => [PS, bigint]

import {
    type CircuitContext,
    sampleContractAddress,
    createConstructorContext,
    createCircuitContext,
} from '@midnight-ntwrk/compact-runtime';

import {
    Contract,
    type Ledger,
    ledger,
} from '../managed/lending/contract/index.js';

import {
    type LendingPrivateState,
    witnesses,
    initialLendingPrivateState,
} from '../witnesses.js';

export class LendingSimulator {
    readonly contract: Contract<LendingPrivateState>;
    circuitContext: CircuitContext<LendingPrivateState>;

    constructor(initialState: LendingPrivateState = initialLendingPrivateState) {
        this.contract = new Contract<LendingPrivateState>(witnesses);

        const { currentPrivateState, currentContractState, currentZswapLocalState } =
            this.contract.initialState(
                createConstructorContext(initialState, '0'.repeat(64)),
            );

        this.circuitContext = createCircuitContext(
            sampleContractAddress(),
            currentZswapLocalState,
            currentContractState,
            currentPrivateState,
        );
    }

    // ─── State Accessors ────────────────────────────────────────────────────────

    public getLedger(): Ledger {
        return ledger(this.circuitContext.currentQueryContext.state);
    }

    public getPrivateState(): LendingPrivateState {
        return this.circuitContext.currentPrivateState;
    }

    // ─── Private State Update ───────────────────────────────────────────────────
    // In production, api.ts updates the private state in LevelDB after each
    // confirmed transaction.  In tests we update it here to keep the simulator
    // consistent.

    public setPrivateState(next: LendingPrivateState): void {
        this.circuitContext = {
            ...this.circuitContext,
            currentPrivateState: next,
        };
    }

    // ─── Circuit Wrappers ───────────────────────────────────────────────────────

    /** Simulate depositCollateral(amount) and update private state. */
    public depositCollateral(amount: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .depositCollateral(this.circuitContext, amount)
            .context;

        const ps = this.getPrivateState();
        this.setPrivateState({ ...ps, collateralAmount: ps.collateralAmount + amount });

        return this.getLedger();
    }

    /** Simulate mintPUSD(amount) and update private state. */
    public mintPUSD(amount: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .mintPUSD(this.circuitContext, amount)
            .context;

        const ps = this.getPrivateState();
        this.setPrivateState({ ...ps, debtAmount: ps.debtAmount + amount });

        return this.getLedger();
    }

    /** Simulate repayPUSD(amount) and update private state. */
    public repayPUSD(amount: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .repayPUSD(this.circuitContext, amount)
            .context;

        const ps = this.getPrivateState();
        this.setPrivateState({ ...ps, debtAmount: ps.debtAmount - amount });

        return this.getLedger();
    }

    /** Simulate withdrawCollateral(amount) and update private state. */
    public withdrawCollateral(amount: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .withdrawCollateral(this.circuitContext, amount)
            .context;

        const ps = this.getPrivateState();
        this.setPrivateState({ ...ps, collateralAmount: ps.collateralAmount - amount });

        return this.getLedger();
    }

    /** Simulate liquidate(victimCollateral, victimDebt). */
    public liquidate(victimCollateral: bigint, victimDebt: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .liquidate(this.circuitContext, victimCollateral, victimDebt)
            .context;
        return this.getLedger();
    }
}
