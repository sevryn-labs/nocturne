// pUSD Lending Protocol: Witness Functions
//
// Witnesses bridge between the user's local private state (LevelDB)
// and the ZK proof engine.  Each witness function receives the current
// WitnessContext (which contains both the ledger state and private state)
// and returns the updated private state alongside the value needed by
// the circuit.
//
// These signatures MUST match the generated Witnesses<PS> type in
// managed/lending/contract/index.d.ts.
//
// NOTE ON pUSD TOKEN BALANCES
// ────────────────────────────
// pUSD token balances (_balances, _totalSupply) are PUBLIC ledger state:
// they do not need to be private witnesses. Only the user's DEBT POSITION
// (how much they personally borrowed) remains private. This means:
//
//   • collateralAmount: private (ZK-proven, never on-chain)
//   • debtAmount      : private (ZK-proven, never on-chain)
//   • pUSD token bal  : public  (on-chain _balances map, queryable by anyone)

import { type WitnessContext } from '@midnight-ntwrk/compact-runtime';
import { type Ledger } from './managed/lending/contract/index.js';

// ─── Per-User Private State ───────────────────────────────────────────────────
//
// Each user's collateral position is kept locally: never exposed on the public ledger.
// The ZK proof certifies it satisfies the collateral constraints.
//
// pUSD token balance is NOT stored here: it is on the public ledger (_balances).

export type LendingPrivateState = {
  /** tNight deposited by this user as collateral */
  collateralAmount: bigint;
  /** pUSD borrowed by this user (outstanding debt). Used for ZK ratio proofs. */
  debtAmount: bigint;
};

/** Zero position: used when no private state has been persisted yet */
export const initialLendingPrivateState: LendingPrivateState = {
  collateralAmount: 0n,
  debtAmount: 0n,
};

// ─── Witness Functions ────────────────────────────────────────────────────────
//
// Compact witnesses are synchronous functions with the signature:
//   (context: WitnessContext<Ledger, PS>) => [PS, returnType]
//
// The first element of the tuple is the (possibly updated) private state.
// The second element is the value the circuit requested.
//
// In this protocol, witnesses are read-only: the private state update
// happens explicitly in api.ts AFTER the transaction confirms, so that
// on-chain failures do not corrupt local state.

export const witnesses = {
  /**
   * Returns the caller's current collateral (tNight) balance.
   * The ZK proof will verify ratio constraints against this value.
   */
  collateralAmount: (context: WitnessContext<Ledger, LendingPrivateState>): [LendingPrivateState, bigint] => {
    return [context.privateState, context.privateState.collateralAmount];
  },

  /**
   * Returns the caller's current pUSD debt balance.
   * The ZK proof will verify repayment and ratio constraints against this.
   *
   * NOTE: This is the DEBT (how much was borrowed), not the token balance.
   * Users can transfer pUSD freely: their token balance may differ from debt.
   * The ZK proof links the private debt to the public totalDebt counter.
   */
  debtAmount: (context: WitnessContext<Ledger, LendingPrivateState>): [LendingPrivateState, bigint] => {
    return [context.privateState, context.privateState.debtAmount];
  },
};
