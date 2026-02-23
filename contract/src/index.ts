// pUSD Lending Protocol — Contract Package Entry Point
//
// Exports both flat names (for internal use) and the `Lending` namespace
// (expected by api.ts and common-types.ts, following the midnight-js convention).

// Flat re-exports (used by tests / witnesses directly)
export {
    Contract,
    ledger,
    pureCircuits,
    contractReferenceLocations,
} from './managed/lending/contract/index.js';

export type {
    Witnesses,
    ImpureCircuits,
    PureCircuits,
    Circuits,
    Ledger,
    ContractReferenceLocations,
} from './managed/lending/contract/index.js';

export { witnesses, initialLendingPrivateState } from './witnesses.js';
export type { LendingPrivateState } from './witnesses.js';

// ─── Lending namespace ────────────────────────────────────────────────────────
// api.ts, common-types.ts, and other consumers import via:
//   import { Lending, ... } from '@midnight-ntwrk/lending-contract'
// and then use Lending.Contract, Lending.ledger, etc.
// This namespace provides that grouped export.

import {
    Contract,
    ledger,
    pureCircuits,
    contractReferenceLocations,
} from './managed/lending/contract/index.js';

export const Lending = {
    Contract,
    ledger,
    pureCircuits,
    contractReferenceLocations,
} as const;
