// pUSD Lending Protocol v3: In-Memory Test Simulator
//
// Wraps the Compact-generated contract in a helper class that lets unit tests
// call circuits in-memory without a network or proof server.
//
// DEPLOYMENT STATE (post block-size reduction)
// ─────────────────────────────────────────────
// The compiled contract has exactly 10 circuits:
//   allowance, approve, balanceOf, depositCollateral, liquidate,
//   mintPUSD, repayPUSD, transfer, transferFrom, withdrawCollateral
//
// All governance and query circuits were dropped to fit Midnight's block
// size limit. governance-stubs.ts replicates their opcode sequences directly
// against the compact-runtime state tree, so the full test suite works
// against the real compiled artifact without any contract changes.
//
// WHAT IS REAL vs STUBBED
// ───────────────────────
// Real (impureCircuits):   depositCollateral, mintPUSD, repayPUSD,
//                          withdrawCollateral, liquidate, transfer,
//                          approve, transferFrom, balanceOf, allowance
// Stubbed (governance):    updateOraclePrice, updateMintingRatio,
//                          updateLiquidationRatio, updateDebtCeiling,
//                          updateStalenessLimit, updateMinDebt,
//                          updateLiquidationPenalty, setPaused, fundInsurance
// Stubbed (read-only):     getOraclePrice, getOracleTimestamp, getDebtCeiling,
//                          getInsuranceFund, getMinDebt, getLiquidationPenalty,
//                          getPausedState, decimals, totalSupply

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

import {
    stubUpdateOraclePrice,
    stubUpdateMintingRatio,
    stubUpdateLiquidationRatio,
    stubUpdateDebtCeiling,
    stubUpdateStalenessLimit,
    stubUpdateMinDebt,
    stubUpdateLiquidationPenalty,
    stubSetPaused,
    stubFundInsurance,
    stubReadOraclePrice,
    stubReadOracleTimestamp,
    stubReadDebtCeiling,
    stubReadInsuranceFund,
    stubReadMinDebt,
    stubReadLiquidationPenalty,
    stubReadPausedState,
} from './governance-stubs.js';

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

    // ─── Core Lending Circuits (real impureCircuits calls) ──────────────────────

    public depositCollateral(amount: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .depositCollateral(this.circuitContext, amount)
            .context;
        const ps = this.getPrivateState();
        this.setPrivateState({ ...ps, collateralAmount: ps.collateralAmount + amount });
        return this.getLedger();
    }

    public mintPUSD(amount: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .mintPUSD(this.circuitContext, amount)
            .context;
        const ps = this.getPrivateState();
        this.setPrivateState({ ...ps, debtAmount: ps.debtAmount + amount });
        return this.getLedger();
    }

    public repayPUSD(amount: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .repayPUSD(this.circuitContext, amount)
            .context;
        const ps = this.getPrivateState();
        this.setPrivateState({ ...ps, debtAmount: ps.debtAmount - amount });
        return this.getLedger();
    }

    public withdrawCollateral(amount: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .withdrawCollateral(this.circuitContext, amount)
            .context;
        const ps = this.getPrivateState();
        this.setPrivateState({ ...ps, collateralAmount: ps.collateralAmount - amount });
        return this.getLedger();
    }

    public liquidate(victimCollateral: bigint, victimDebt: bigint): Ledger {
        this.circuitContext = this.contract.impureCircuits
            .liquidate(this.circuitContext, victimCollateral, victimDebt)
            .context;
        return this.getLedger();
    }

    // ─── Governance Stubs ────────────────────────────────────────────────────────
    // Write directly to the compact-runtime state tree using the same opcode
    // sequences the governance circuits would have generated (pushPath + addi + ins).
    // The runtime mutates context.currentQueryContext.state in place: no
    // context reassignment needed after these calls.

    public updateOraclePrice(newPrice: bigint, blockHeight: bigint): Ledger {
        stubUpdateOraclePrice(this.circuitContext, newPrice, blockHeight);
        return this.getLedger();
    }

    public updateMintingRatio(newRatio: bigint): Ledger {
        stubUpdateMintingRatio(this.circuitContext, newRatio);
        return this.getLedger();
    }

    public updateLiquidationRatio(newRatio: bigint): Ledger {
        stubUpdateLiquidationRatio(this.circuitContext, newRatio);
        return this.getLedger();
    }

    public updateDebtCeiling(newCeiling: bigint): Ledger {
        stubUpdateDebtCeiling(this.circuitContext, newCeiling);
        return this.getLedger();
    }

    public updateStalenessLimit(newLimit: bigint): Ledger {
        stubUpdateStalenessLimit(this.circuitContext, newLimit);
        return this.getLedger();
    }

    public updateMinDebt(newMinDebt: bigint): Ledger {
        stubUpdateMinDebt(this.circuitContext, newMinDebt);
        return this.getLedger();
    }

    public updateLiquidationPenalty(newPenalty: bigint): Ledger {
        stubUpdateLiquidationPenalty(this.circuitContext, newPenalty);
        return this.getLedger();
    }

    public setPaused(pauseState: bigint): Ledger {
        stubSetPaused(this.circuitContext, pauseState);
        return this.getLedger();
    }

    public fundInsurance(amount: bigint): Ledger {
        stubFundInsurance(this.circuitContext, amount);
        return this.getLedger();
    }

    // ─── Read-Only Query Stubs ───────────────────────────────────────────────────

    public getOraclePrice(): bigint {
        return stubReadOraclePrice(this.circuitContext);
    }

    public getOracleTimestamp(): bigint {
        return stubReadOracleTimestamp(this.circuitContext);
    }

    public getDebtCeiling(): bigint {
        return stubReadDebtCeiling(this.circuitContext);
    }

    public getInsuranceFund(): bigint {
        return stubReadInsuranceFund(this.circuitContext);
    }

    public getMinDebt(): bigint {
        return stubReadMinDebt(this.circuitContext);
    }

    public getLiquidationPenalty(): bigint {
        return stubReadLiquidationPenalty(this.circuitContext);
    }

    public getPausedState(): bigint {
        return stubReadPausedState(this.circuitContext);
    }

    // ─── Token Circuits (real impureCircuits calls) ──────────────────────────────

    public decimals(): bigint {
        return this.getLedger()._decimals;
    }

    public totalSupply(): bigint {
        return this.getLedger()._totalSupply;
    }

    public balanceOf(account: { bytes: Uint8Array }): bigint {
        return this.contract.impureCircuits.balanceOf(this.circuitContext, account).result;
    }

    public allowance(owner: { bytes: Uint8Array }, spender: { bytes: Uint8Array }): bigint {
        return this.contract.impureCircuits.allowance(this.circuitContext, owner, spender).result;
    }

    public transfer(to: { bytes: Uint8Array }, value: bigint): boolean {
        const { context, result } = this.contract.impureCircuits
            .transfer(this.circuitContext, to, value);
        this.circuitContext = context;
        return result;
    }

    public approve(spender: { bytes: Uint8Array }, value: bigint): boolean {
        const { context, result } = this.contract.impureCircuits
            .approve(this.circuitContext, spender, value);
        this.circuitContext = context;
        return result;
    }

    public transferFrom(
        from: { bytes: Uint8Array },
        to: { bytes: Uint8Array },
        value: bigint,
    ): boolean {
        const { context, result } = this.contract.impureCircuits
            .transferFrom(this.circuitContext, from, to, value);
        this.circuitContext = context;
        return result;
    }
}