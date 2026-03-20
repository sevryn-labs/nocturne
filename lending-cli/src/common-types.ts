// pUSD Lending Protocol: Shared TypeScript Types
//
// These types wire the Compact-generated contract API to midnight-js.
// They mirror the pattern in the example-counter but are adapted for the
// lending protocol's circuits and private state.

import { Lending, type LendingPrivateState } from '@midnight-ntwrk/lending-contract';
import type { MidnightProviders } from '@midnight-ntwrk/midnight-js-types';
import type { DeployedContract, FoundContract } from '@midnight-ntwrk/midnight-js-contracts';

// ─── Circuit Identifier ──────────────────────────────────────────────────────

export type LendingCircuits = string;

// ─── Private State Key ───────────────────────────────────────────────────────

/**
 * Key used to look up this user's private state in LevelDB.
 * One entry per user (not per position): each user has exactly one
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

/** Raw Contract instance. */
export type LendingContract = any;

/** Handle to a contract that has been deployed or joined in the current session. */
export type DeployedLendingContract = any;

// ─── Protocol View ───────────────────────────────────────────────────────────

/**
 * Human-readable snapshot of the protocol's public ledger state.
 * Returned by `getProtocolState()` in api.ts.
 *
 * v3: Added oracle price, timestamp, debt ceiling, penalty, insurance fund,
 *     min debt, and pause state.
 */
export interface ProtocolState {
    totalCollateral: bigint;
    totalDebt: bigint;
    liquidationRatio: bigint;
    mintingRatio: bigint;
    /** pUSD token total supply: always equals totalDebt (supply == debt invariant) */
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

/**
 * Human-readable snapshot of one user's private position.
 * Returned by `getPosition()` in api.ts; reads from local private state store.
 *
 * v3: Collateral ratio now incorporates oracle price.
 */
export interface UserPosition {
    collateralAmount: bigint;
    debtAmount: bigint;
    /** Collateral ratio in percent, oracle-price-adjusted (0 if debtAmount == 0). */
    collateralRatio: bigint;
    /** True when the position has debt but collateral ratio < liquidation ratio. */
    isLiquidatable: boolean;
}
