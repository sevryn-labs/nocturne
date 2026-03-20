// pUSD Lending Protocol v3 — In-Memory Test Simulator
//
// Wraps the Compact-generated contract in a helper class that lets unit tests
// call circuits in-memory without a network or proof server.
//
// v3 changes:
//   - Oracle price support (updateOraclePrice, getOraclePrice)
//   - Admin governance circuits (updateMintingRatio, updateLiquidationRatio, etc.)
//   - Debt ceiling, min debt, insurance fund, pause mechanism
//   - Updated ratio checks use oracle price

import {
    type CircuitContext,
    sampleContractAddress,
    createConstructorContext,
    createCircuitContext,
    ownPublicKey,
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

    public getOwnPublicKey(): { bytes: Uint8Array } {
        return ownPublicKey(this.circuitContext) as { bytes: Uint8Array };
    }

    // ─── Private State Update ───────────────────────────────────────────────────

    public setPrivateState(next: LendingPrivateState): void {
        this.circuitContext = {
            ...this.circuitContext,
            currentPrivateState: next,
        };
    }

    // ─── Core Lending Circuits ──────────────────────────────────────────────────

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

    // ─── Admin / Governance Circuits ────────────────────────────────────────────

    /** Update oracle price. Price uses 4-decimal precision: $1.00 = 10000. */
    public updateOraclePrice(newPrice: bigint, blockHeight: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .updateOraclePrice(this.circuitContext, newPrice, blockHeight)
            .context;
        return this.getLedger();
    }

    public updateMintingRatio(newRatio: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .updateMintingRatio(this.circuitContext, newRatio)
            .context;
        return this.getLedger();
    }

    public updateLiquidationRatio(newRatio: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .updateLiquidationRatio(this.circuitContext, newRatio)
            .context;
        return this.getLedger();
    }

    public updateDebtCeiling(newCeiling: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .updateDebtCeiling(this.circuitContext, newCeiling)
            .context;
        return this.getLedger();
    }

    public updateStalenessLimit(newLimit: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .updateStalenessLimit(this.circuitContext, newLimit)
            .context;
        return this.getLedger();
    }

    public updateMinDebt(newMinDebt: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .updateMinDebt(this.circuitContext, newMinDebt)
            .context;
        return this.getLedger();
    }

    public updateLiquidationPenalty(newPenalty: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .updateLiquidationPenalty(this.circuitContext, newPenalty)
            .context;
        return this.getLedger();
    }

    public setPaused(pauseState: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .setPaused(this.circuitContext, pauseState)
            .context;
        return this.getLedger();
    }

    public fundInsurance(amount: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .fundInsurance(this.circuitContext, amount)
            .context;
        return this.getLedger();
    }

    // ─── Read-Only Query Circuits ───────────────────────────────────────────────

    public getOraclePrice(): bigint {
        return this.contract.impureCircuits.getOraclePrice(this.circuitContext).result;
    }

    public getOracleTimestamp(): bigint {
        return this.contract.impureCircuits.getOracleTimestamp(this.circuitContext).result;
    }

    public getDebtCeiling(): bigint {
        return this.contract.impureCircuits.getDebtCeiling(this.circuitContext).result;
    }

    public getInsuranceFund(): bigint {
        return this.contract.impureCircuits.getInsuranceFund(this.circuitContext).result;
    }

    public getMinDebt(): bigint {
        return this.contract.impureCircuits.getMinDebt(this.circuitContext).result;
    }

    public getLiquidationPenalty(): bigint {
        return this.contract.impureCircuits.getLiquidationPenalty(this.circuitContext).result;
    }

    public getPausedState(): bigint {
        return this.contract.impureCircuits.getPausedState(this.circuitContext).result;
    }

    // ─── Token Circuits ─────────────────────────────────────────────────────────

    public decimals(): bigint {
        return this.contract.impureCircuits.decimals(this.circuitContext).result;
    }

    public totalSupply(): bigint {
        return this.contract.impureCircuits.totalSupply(this.circuitContext).result;
    }

    public balanceOf(account: { bytes: Uint8Array }): bigint {
        return this.contract.impureCircuits.balanceOf(this.circuitContext, account).result;
    }

    public allowance(owner: { bytes: Uint8Array }, spender: { bytes: Uint8Array }): bigint {
        return this.contract.impureCircuits.allowance(this.circuitContext, owner, spender).result;
    }

    public transfer(to: { bytes: Uint8Array }, value: bigint): boolean {
        const { context, result } = this.contract.impureCircuits.transfer(this.circuitContext, to, value);
        this.circuitContext = context;
        return result;
    }

    public approve(spender: { bytes: Uint8Array }, value: bigint): boolean {
        const { context, result } = this.contract.impureCircuits.approve(this.circuitContext, spender, value);
        this.circuitContext = context;
        return result;
    }

    public transferFrom(from: { bytes: Uint8Array }, to: { bytes: Uint8Array }, value: bigint): boolean {
        const { context, result } = this.contract.impureCircuits.transferFrom(this.circuitContext, from, to, value);
        this.circuitContext = context;
        return result;
    }
}
