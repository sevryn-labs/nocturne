// pUSD Lending Protocol — Shared TypeScript Types
//
// These types wire the Compact-generated contract API to midnight-js.
// They mirror the pattern in the example-counter but are adapted for the
// lending protocol's circuits and private state.

import { Lending, type LendingPrivateState } from '@midnight-ntwrk/lending-contract';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';
import type { ImpureCircuitId } from '@midnight-ntwrk/compact-js';

// ─── Circuit Identifier ──────────────────────────────────────────────────────

/**
 * Union of all impure circuit names declared in lending.compact.
 * midnight-js uses this to route ZK proof requests to the correct key.
 *
 * Circuits: depositCollateral | mintPUSD | repayPUSD | withdrawCollateral | liquidate
 */
export type LendingCircuits = ImpureCircuitId<Lending.Contract<LendingPrivateState>>;

// ─── Private State Key ───────────────────────────────────────────────────────

/**
 * Key used to look up this user's private state in LevelDB.
 * One entry per user (not per position) — each user has exactly one
 * lending position in this MVP.
 */
export const LendingPrivateStateId = 'lendingPrivateState' as const;
export type LendingPrivateStateId = typeof LendingPrivateStateId;

// ─── Provider Bundle ─────────────────────────────────────────────────────────

/**
 * All midnight-js providers required to interact with the lending contract.
 * Typed over the lending circuits and private state.
 */
export type LendingProviders = MidnightProviders<
    LendingCircuits,
    LendingPrivateStateId,
    LendingPrivateState
>;

// ─── Contract Handle Types ───────────────────────────────────────────────────

/** Raw Contract instance (used to create the providers bundle). */
export type LendingContract = Lending.Contract<LendingPrivateState>;

/** Handle to a contract that has been deployed in the current session. */
export type DeployedLendingContract = DeployedContract<LendingContract> | FoundContract<LendingContract>;

// ─── Protocol View ───────────────────────────────────────────────────────────

/**
 * Human-readable snapshot of the protocol's public ledger state.
 * Returned by `getProtocolState()` in api.ts.
 */
export interface ProtocolState {
    totalCollateral: bigint;
    totalDebt: bigint;
    liquidationRatio: bigint;
    mintingRatio: bigint;
    /** pUSD token total supply — always equals totalDebt (supply == debt invariant) */
    totalSupply: bigint;
}

/**
 * Human-readable snapshot of one user's private position.
 * Returned by `getPosition()` in api.ts; reads from local private state store.
 */
export interface UserPosition {
    collateralAmount: bigint;
    debtAmount: bigint;
    /** Collateral ratio in percent (0 if debtAmount == 0). */
    collateralRatio: bigint;
    /** True when the position has debt but collateral ratio < liquidation ratio. */
    isLiquidatable: boolean;
}
