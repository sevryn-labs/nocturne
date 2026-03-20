// pUSD Lending Protocol — Shared Types for API layer
// Re-exports types from lending-cli for use in the REST server.

import { Lending, type LendingPrivateState } from '@midnight-ntwrk/lending-contract';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ImpureCircuitId } from '@midnight-ntwrk/compact-js';

export type LendingCircuits = ImpureCircuitId<Lending.Contract<LendingPrivateState>>;

export const LendingPrivateStateId = 'lendingPrivateState' as const;
export type LendingPrivateStateId = typeof LendingPrivateStateId;

export type LendingProviders = MidnightProviders<
    LendingCircuits,
    LendingPrivateStateId,
    LendingPrivateState
>;

export type LendingContract = Lending.Contract<LendingPrivateState>;
export type DeployedLendingContract = DeployedContract<LendingContract> | FoundContract<LendingContract>;

export interface ProtocolState {
    totalCollateral: bigint;
    totalDebt: bigint;
    liquidationRatio: bigint;
    mintingRatio: bigint;
    /** pUSD token total supply — always equals totalDebt (supply == debt invariant) */
    totalSupply: bigint;
    /** Oracle price with 4-decimal precision: $1.00 = 10000 */
    oraclePrice: bigint;
    /** Block height of last oracle update */
    oracleTimestamp: bigint;
    /** Max blocks before oracle is considered stale */
    oracleStalenessLimit: bigint;
    /** Maximum total system debt allowed */
    debtCeiling: bigint;
    /** Liquidation penalty in basis points (1300 = 13%) */
    liquidationPenalty: bigint;
    /** Protocol reserve for bad debt absorption */
    insuranceFund: bigint;
    /** Minimum vault debt (prevents dust positions) */
    minDebt: bigint;
    /** 0 = active, 1 = paused */
    paused: bigint;
}

export interface UserPosition {
    collateralAmount: bigint;
    debtAmount: bigint;
    /** Collateral ratio in percent, oracle-price-adjusted (0 if debtAmount == 0). */
    collateralRatio: bigint;
    /** True when the position has debt but collateral ratio < liquidation ratio. */
    isLiquidatable: boolean;
}
