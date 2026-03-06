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
}

export interface UserPosition {
    collateralAmount: bigint;
    debtAmount: bigint;
    collateralRatio: bigint;
    isLiquidatable: boolean;
}
