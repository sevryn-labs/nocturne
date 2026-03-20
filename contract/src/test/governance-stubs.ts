// Synthetic governance circuits for the pUSD lending protocol v3 simulator.
//
// WHY THIS EXISTS
// ───────────────
// The compiled contract has 10 circuits. All governance circuits were dropped
// to fit Midnight's block size limit at deployment. The ledger state is a
// Compact StateValue Merkle tree: it cannot be mutated with plain JS property
// assignment. Every write must go through the compact-runtime opcode pipeline
// via queryLedgerState.
//
// WRITE STRATEGY
// ──────────────
// We use the push+push+ins+ins pattern observed in the compiled transfer
// circuit (index.js lines ~1540-1553). This writes an absolute StateValue.newCell
// directly to a slot: no delta arithmetic, no addi/subi, no sign issues:
//
//   { push: { storage: false, value: StateValue.newCell({value, alignment}).encode() } }
//   { push: { storage: true,  value: StateValue.newCell({value, alignment}).encode() } }
//   { ins: { cached: false, n: 1 } }
//   { ins: { cached: true,  n: 2 } }
//
// The first push is the path key, the second is the new cell value.
// The two ins operations commit both into the state tree.
//
// All opcode objects are cast via `as any` because the TypeScript types for
// the internal opcode union are not exported by compact-runtime.
//
// SLOT MAP (read from compiled index.js getter implementations)
// ─────────────────────────────────────────────────────────────
// Counters (group 0n):
//   [0n, 0n] → totalCollateral
//   [0n, 1n] → totalDebt
//
// Uint<64> params (group 1n):
//   [1n, 1n]  → insuranceFund
//   [1n, 2n]  → liquidationRatio
//   [1n, 3n]  → mintingRatio
//   [1n, 4n]  → oraclePrice
//   [1n, 5n]  → oracleTimestamp
//   [1n, 6n]  → oracleStalenessLimit
//   [1n, 7n]  → debtCeiling
//   [1n, 8n]  → liquidationPenalty
//   [1n, 9n]  → minDebt
//   [1n, 10n] → paused

import * as __compactRuntime from '@midnight-ntwrk/compact-runtime';
import type { CircuitContext } from '@midnight-ntwrk/compact-runtime';
import type { LendingPrivateState } from '../witnesses.js';

// Uint<16>: used for path index encoding (matches _descriptor_1 in compiled JS)
const PATH_TYPE = new __compactRuntime.CompactTypeUnsignedInteger(65535n, 2);

// Uint<64>: used for all governance parameter values (matches _descriptor_0)
const VALUE_TYPE = new __compactRuntime.CompactTypeUnsignedInteger(18446744073709551615n, 8);

function pathEntry(n: bigint): any {
    return {
        tag: 'value',
        value: {
            value: PATH_TYPE.toValue(n),
            alignment: PATH_TYPE.alignment(),
        },
    };
}

function makeProofData(): any {
    return {
        input: { value: new Uint8Array(0), alignment: [] },
        output: undefined,
        publicTranscript: [],
        privateTranscriptOutputs: [],
    };
}

/**
 * Read a Uint<64> value from ledger slot at path [groupIdx, slotIdx].
 * Uses pushPath:false + popeq: same pattern as the compiled getters.
 */
function readSlot(
    context: CircuitContext<LendingPrivateState>,
    groupIdx: bigint,
    slotIdx: bigint,
): bigint {
    const pd = makeProofData();
    const result: any = __compactRuntime.queryLedgerState(context as any, pd, [
        { dup: { n: 0 } } as any,
        {
            idx: {
                cached: false,
                pushPath: false,
                path: [pathEntry(groupIdx), pathEntry(slotIdx)],
            },
        } as any,
        { popeq: { cached: false, result: undefined } } as any,
    ]);
    // queryLedgerState returns AlignedValue | GatherResult[]
    // When used with popeq (non-gather), result is AlignedValue with .value
    return VALUE_TYPE.fromValue((result as any).value);
}

/**
 * Write a Uint<64> value to ledger slot at path [groupIdx, slotIdx].
 *
 * Uses the push+push+ins+ins pattern from the compiled transfer circuit.
 * This writes the absolute new value directly: no delta, no addi/subi.
 *
 * Sequence:
 *   push (storage:false) → push the path key cell
 *   push (storage:true)  → push the new value cell
 *   ins (cached:false, n:1) → insert path into state tree
 *   ins (cached:true,  n:2) → insert value at that path
 */
function writeSlot(
    context: CircuitContext<LendingPrivateState>,
    groupIdx: bigint,
    slotIdx: bigint,
    newValue: bigint,
): void {
    const pd = makeProofData();

    // Encode the path key as a cell: this is how the slot address is expressed
    // in the state tree. We use the two-component path [groupIdx, slotIdx].
    const pathKeyCell = __compactRuntime.StateValue.newCell({
        value: PATH_TYPE.toValue(slotIdx),
        alignment: PATH_TYPE.alignment(),
    }).encode();

    // Encode the new value as a cell
    const valueCell = __compactRuntime.StateValue.newCell({
        value: VALUE_TYPE.toValue(newValue),
        alignment: VALUE_TYPE.alignment(),
    }).encode();

    __compactRuntime.queryLedgerState(context as any, pd, [
        // Navigate to the group first
        {
            idx: {
                cached: false,
                pushPath: true,
                path: [pathEntry(groupIdx)],
            },
        } as any,
        // Push path key and value cells, then insert
        { push: { storage: false, value: pathKeyCell } } as any,
        { push: { storage: true, value: valueCell } } as any,
        { ins: { cached: false, n: 1 } } as any,
        { ins: { cached: true, n: 2 } } as any,
    ]);
}

// ─── Exported governance stub functions ──────────────────────────────────────

export function stubUpdateOraclePrice(
    context: CircuitContext<LendingPrivateState>,
    newPrice: bigint,
    blockHeight: bigint,
): void {
    if (newPrice <= 0n) throw new Error('Oracle price must be positive');
    const currentTimestamp = readSlot(context, 1n, 5n);
    if (blockHeight < currentTimestamp) {
        throw new Error('Block height must not decrease');
    }
    writeSlot(context, 1n, 4n, newPrice);
    writeSlot(context, 1n, 5n, blockHeight);
}

export function stubUpdateMintingRatio(
    context: CircuitContext<LendingPrivateState>,
    newRatio: bigint,
): void {
    if (newRatio < 110n) throw new Error('Minting ratio too low (min 110)');
    if (newRatio > 300n) throw new Error('Minting ratio too high (max 300)');
    writeSlot(context, 1n, 3n, newRatio);
}

export function stubUpdateLiquidationRatio(
    context: CircuitContext<LendingPrivateState>,
    newRatio: bigint,
): void {
    if (newRatio < 110n) throw new Error('Liquidation ratio too low (min 110)');
    if (newRatio > 300n) throw new Error('Liquidation ratio too high (max 300)');
    writeSlot(context, 1n, 2n, newRatio);
}

export function stubUpdateDebtCeiling(
    context: CircuitContext<LendingPrivateState>,
    newCeiling: bigint,
): void {
    if (newCeiling <= 0n) throw new Error('Debt ceiling must be positive');
    writeSlot(context, 1n, 7n, newCeiling);
}

export function stubUpdateStalenessLimit(
    context: CircuitContext<LendingPrivateState>,
    newLimit: bigint,
): void {
    if (newLimit < 10n) throw new Error('Staleness limit too low (min 10)');
    if (newLimit > 10000n) throw new Error('Staleness limit too high (max 10000)');
    writeSlot(context, 1n, 6n, newLimit);
}

export function stubUpdateMinDebt(
    context: CircuitContext<LendingPrivateState>,
    newMinDebt: bigint,
): void {
    if (newMinDebt < 0n) throw new Error('Min debt cannot be negative');
    writeSlot(context, 1n, 9n, newMinDebt);
}

export function stubUpdateLiquidationPenalty(
    context: CircuitContext<LendingPrivateState>,
    newPenalty: bigint,
): void {
    if (newPenalty < 500n) throw new Error('Liquidation penalty too low (min 500 bps)');
    if (newPenalty > 2500n) throw new Error('Liquidation penalty too high (max 2500 bps)');
    writeSlot(context, 1n, 8n, newPenalty);
}

export function stubSetPaused(
    context: CircuitContext<LendingPrivateState>,
    pauseState: bigint,
): void {
    if (pauseState !== 0n && pauseState !== 1n) {
        throw new Error('Pause state must be 0 (active) or 1 (paused)');
    }
    writeSlot(context, 1n, 10n, pauseState);
}

export function stubFundInsurance(
    context: CircuitContext<LendingPrivateState>,
    amount: bigint,
): void {
    if (amount <= 0n) throw new Error('Insurance funding amount must be positive');
    const current = readSlot(context, 1n, 1n);
    writeSlot(context, 1n, 1n, current + amount);
}

// ─── Read stubs ───────────────────────────────────────────────────────────────

export function stubReadOraclePrice(context: CircuitContext<LendingPrivateState>): bigint {
    return readSlot(context, 1n, 4n);
}

export function stubReadOracleTimestamp(context: CircuitContext<LendingPrivateState>): bigint {
    return readSlot(context, 1n, 5n);
}

export function stubReadDebtCeiling(context: CircuitContext<LendingPrivateState>): bigint {
    return readSlot(context, 1n, 7n);
}

export function stubReadInsuranceFund(context: CircuitContext<LendingPrivateState>): bigint {
    return readSlot(context, 1n, 1n);
}

export function stubReadMinDebt(context: CircuitContext<LendingPrivateState>): bigint {
    return readSlot(context, 1n, 9n);
}

export function stubReadLiquidationPenalty(context: CircuitContext<LendingPrivateState>): bigint {
    return readSlot(context, 1n, 8n);
}

export function stubReadPausedState(context: CircuitContext<LendingPrivateState>): bigint {
    return readSlot(context, 1n, 10n);
}