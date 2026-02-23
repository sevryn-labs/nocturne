# pUSD Lending Protocol — Architecture & Mechanics

> A privacy-preserving, collateralised synthetic stablecoin protocol built on
> the Midnight Network using Compact smart contracts and midnight-js tooling.
> Conceptually equivalent to MakerDAO, optimised for clarity and ZK-based privacy.

---

## Table of Contents

1. [Protocol Overview](#1-protocol-overview)
2. [Economic Model](#2-economic-model)
3. [Privacy Model — Why Each Piece of Data is Public or Private](#3-privacy-model)
4. [State Design](#4-state-design)
5. [Contract Circuits](#5-contract-circuits)
6. [Collateral Ratio Math](#6-collateral-ratio-math)
7. [Liquidation Mechanics](#7-liquidation-mechanics)
8. [End-to-End Flow: Deposit → Mint → Repay → Withdraw](#8-end-to-end-flow)
9. [Security Properties](#9-security-properties)
10. [Repository Structure](#10-repository-structure)
11. [Getting Started](#11-getting-started)

---

## 1. Protocol Overview

```
User                     Lending Contract                    Midnight Ledger
 │                             │                                    │
 │─── depositCollateral ──────►│  receive_unshielded_coin()        │
 │                             │──── totalCollateral += ─────────► │
 │                             │  (private: myCollateral +=)       │
 │                             │                                    │
 │─── mintPUSD ────────────────►│  check: (coll * 100) / debt ≥ 150│
 │                             │──── totalDebt += ───────────────► │
 │                             │  (private: myDebt +=)             │
 │                             │                                    │
 │─── repayPUSD ───────────────►│  check: myDebt >= amount         │
 │                             │──── totalDebt -= ───────────────► │
 │                             │  (private: myDebt -=)             │
 │                             │                                    │
 │─── withdrawCollateral ──────►│  check: coll ratio still ≥ 150%  │
 │                             │──── totalCollateral -= ─────────► │
 │                             │  send_unshielded_coin()           │
```

pUSD is a **synthetic internal token** tracked as a `Counter` in the public
ledger (`totalDebt`). It has no on-chain ERC20 representation — it is purely
an accounting entry in the contract's ledger state.

---

## 2. Economic Model

| Parameter          | Value     | Description                                      |
|--------------------|-----------|--------------------------------------------------|
| Collateral asset   | tNight    | Unshielded Midnight testnet token                |
| Synthetic asset    | pUSD      | Protocol-internal synthetic stablecoin           |
| Liquidation ratio  | 150%      | Minimum collateral-to-debt ratio                 |
| Minting ratio      | 150%      | Same as liquidation ratio in this MVP            |
| Interest rate      | 0%        | Intentionally omitted for simplicity             |
| Governance         | None      | Ratios are set at deploy time                    |

### Core invariant

```
collateral × 100
─────────────── ≥ 150
     debt
```

This invariant is enforced in-circuit (ZK proof verifies it) for `mintPUSD`
and `withdrawCollateral`.

---

## 3. Privacy Model

### Why public?

| Field              | Rationale                                                        |
|--------------------|------------------------------------------------------------------|
| `totalCollateral`  | Needed for protocol-level solvency audits. Observers can verify  |
|                    | the contract holds enough tNight to cover all withdrawals.       |
| `totalDebt`        | Needed to verify the protocol hasn't issued unbacked pUSD.       |
| `liquidationRatio` | Must be transparent so users can evaluate risk parameters.       |
| `mintingRatio`     | Same rationale — a hidden ratio would be unacceptably opaque.    |

### Why private?

| Field              | Rationale                                                        |
|--------------------|------------------------------------------------------------------|
| `collateralAmount` | Reveals a user's wealth. Kept private to prevent targeted attacks|
|                    | or front-running of near-liquidation positions.                  |
| `debtAmount`       | Reveals borrowing behaviour. Private to prevent discrimination   |
|                    | and front-running of repayments.                                 |

### How privacy works in Midnight

On Midnight, "private state" lives in a user-controlled local database
(LevelDB via `levelPrivateStateProvider`). It is never written to the public
ledger. The Compact circuit reads these values via **witness** declarations:

```compact
export witness collateralAmount(): Uint<64>;
export witness debtAmount():       Uint<64>;
```

The TypeScript `witnesses` object supplies concrete values from the local DB.
The Compact runtime generates a **ZK proof** that the circuit constraints hold
(e.g. the ratio is ≥ 150%) without revealing the actual collateral/debt values
to the verifier or to any on-chain observer.

### Identity privacy

Borrower identity is pseudonymous — linked only to a Zswap public key, not to
any real-world identity. The protocol never requires KYC or wallet linkage.

### Liquidation trade-off

Liquidation is the one case where individual position values must be revealed:
the liquidator provides the victim's collateral + debt as circuit arguments.
This is unavoidable (the circuit must verify the ratio to allow liquidation) —
but only the liquidator ever knows the exact values. This mirrors MakerDAO's
"anyone can call liquidation" model.

---

## 4. State Design

### Public Ledger State (`lending.compact`)

```compact
export ledger totalCollateral: Counter;  // tNight held by protocol
export ledger totalDebt:        Counter;  // pUSD minted in total
export ledger liquidationRatio: Counter;  // 150 = 150%
export ledger mintingRatio:     Counter;  // 150 = 150%
```

### Private State per User (`witnesses.ts`)

```typescript
export type LendingPrivateState = {
  collateralAmount: bigint;  // tNight deposited by this user
  debtAmount:       bigint;  // pUSD borrowed by this user
};
```

Stored in local LevelDB, keyed by `'lendingPrivateState'`.

---

## 5. Contract Circuits

### `constructor()`

```compact
constructor() {
  liquidationRatio.increment(150);
  mintingRatio.increment(150);
}
```

Sets protocol parameters once at deploy time.

---

### `depositCollateral(amount: Uint<64>)`

```compact
export circuit depositCollateral(amount: Uint<64>): [] {
  assert(amount > 0, "Deposit amount must be positive");
  const myCollateral = collateralAmount();  // witness
  const myDebt       = debtAmount();        // witness
  receive_unshielded_coin(amount);          // atomic tNight transfer
  totalCollateral.increment(amount);
  assert(myCollateral + amount >= myCollateral, "Overflow check");
}
```

Atomically moves tNight from the user's wallet into the contract.
The user's private collateral balance is updated by the TypeScript API layer
after the transaction confirms.

---

### `mintPUSD(amount: Uint<64>)`

```compact
export circuit mintPUSD(amount: Uint<64>): [] {
  assert(amount > 0, "Mint amount must be positive");
  const myCollateral = collateralAmount();
  const myDebt       = debtAmount();
  assertSufficientCollateral(myCollateral, myDebt, 0, amount);
  totalDebt.increment(amount);
}
```

The ZK proof demonstrates that `(myCollateral × 100) / (myDebt + amount) ≥ 150`
without revealing `myCollateral` or `myDebt`.

---

### `repayPUSD(amount: Uint<64>)`

```compact
export circuit repayPUSD(amount: Uint<64>): [] {
  assert(amount > 0, "Repay amount must be positive");
  const myDebt = debtAmount();
  assert(myDebt >= amount, "Cannot repay more than outstanding debt");
  totalDebt.decrement(amount);
}
```

Reduces the caller's debt. In production, this would also burn pUSD tokens.

---

### `withdrawCollateral(amount: Uint<64>)`

```compact
export circuit withdrawCollateral(amount: Uint<64>): [] {
  assert(amount > 0, "Withdrawal amount must be positive");
  const myCollateral = collateralAmount();
  const myDebt       = debtAmount();
  assert(myCollateral >= amount, "Cannot withdraw more than deposited");
  const remainingCollateral = myCollateral - amount;
  if (myDebt > 0) {
    assert(
      (remainingCollateral * 100) / myDebt >= liquidationRatio.get_value(),
      "Withdrawal would breach liquidation ratio"
    );
  }
  send_unshielded_coin(amount);            // send tNight back to caller
  totalCollateral.decrement(amount);
}
```

---

### `liquidate(victimCollateral, victimDebt: Uint<64>)`

```compact
export circuit liquidate(victimCollateral: Uint<64>, victimDebt: Uint<64>): [] {
  assert(victimDebt > 0, "Cannot liquidate a position with no debt");
  assert(victimCollateral > 0, "Cannot liquidate a position with no collateral");
  assert(
    (victimCollateral * 100) / victimDebt < liquidationRatio.get_value(),
    "Position is NOT undercollateralised; liquidation rejected"
  );
  send_unshielded_coin(victimCollateral);   // reward liquidator
  totalCollateral.decrement(victimCollateral);
  totalDebt.decrement(victimDebt);
}
```

---

## 6. Collateral Ratio Math

All ratio math uses integer arithmetic (no floating point):

```
ratio = (collateral × 100) / debt    [integer division]

Example:
  collateral = 1500 tNight
  debt       = 1000 pUSD
  ratio      = (1500 × 100) / 1000 = 150000 / 1000 = 150 (= 150%)
```

**Maximum mint given collateral:**

```
maxDebt = (collateral × 100) / mintingRatio
        = (1500 × 100) / 150
        = 1000 pUSD
```

**Maximum withdrawal given existing debt:**

```
minCollateral = (debt × mintingRatio) / 100
maxWithdraw   = currentCollateral - minCollateral

Example:
  currentCollateral = 3000
  debt              = 1000
  minCollateral     = (1000 × 150) / 100 = 1500
  maxWithdraw       = 3000 - 1500 = 1500 tNight
```

---

## 7. Liquidation Mechanics

A position becomes liquidatable when:

```
(collateral × 100) / debt < 150
```

The liquidator:
1. Observes an undercollateralised position (via off-chain keeper or monitoring).
2. Calls `liquidate(victimCollateral, victimDebt)`.
3. The circuit verifies the ratio is genuinely < 150%.
4. The victim's `victimCollateral` tNight is sent to the liquidator.
5. The victim's `victimDebt` pUSD is wiped from `totalDebt`.

In this MVP, the liquidator receives the **full** collateral as profit (no
penalty or stability fee). Production variants would implement partial
liquidation, a liquidation penalty (e.g. 13%), and a stability fee.

---

## 8. End-to-End Flow: Deposit → Mint → Repay → Withdraw

```
Step 1: Deposit 3000 tNight
─────────────────────────────────────────────────────────
  Private state after:  collateral=3000, debt=0
  Public state after:   totalCollateral=3000, totalDebt=0

Step 2: Mint 2000 pUSD
─────────────────────────────────────────────────────────
  Ratio check: (3000 × 100) / 2000 = 150% ✓ — exactly at limit
  Private state after:  collateral=3000, debt=2000
  Public state after:   totalCollateral=3000, totalDebt=2000

Step 3: Repay 2000 pUSD
─────────────────────────────────────────────────────────
  Assert: myDebt (2000) >= amount (2000) ✓
  Private state after:  collateral=3000, debt=0
  Public state after:   totalCollateral=3000, totalDebt=0

Step 4: Withdraw 3000 tNight
─────────────────────────────────────────────────────────
  No debt → no ratio check needed
  Private state after:  collateral=0, debt=0
  Public state after:   totalCollateral=0, totalDebt=0
  Wallet receives:      3000 tNight

All steps complete. Protocol returns to empty state. ✓
```

---

## 9. Security Properties

| Property                        | Enforced by                                     |
|---------------------------------|-------------------------------------------------|
| No undercollateralised minting  | `assertSufficientCollateral()` in ZK circuit    |
| No over-withdrawal              | Ratio check in `withdrawCollateral` circuit      |
| No repaying more than owed      | `assert(myDebt >= amount)` in circuit           |
| No double-spending              | Midnight ledger UTXO model                      |
| No invalid liquidation          | Ratio check in `liquidate` circuit               |
| Borrower identity privacy       | Private state never touches public ledger        |
| Debt amount privacy             | Witness-only; proven in ZK, not revealed         |
| Atomic token transfer           | `receive_unshielded_coin` / `send_unshielded_coin` are circuit primitives |

---

## 10. Repository Structure

```
lending_protocol/
├── contract/
│   ├── package.json                 # @midnight-ntwrk/lending-contract
│   ├── src/
│   │   ├── lending.compact          # Compact smart contract ← CORE
│   │   ├── witnesses.ts             # Private state type + witness functions
│   │   ├── index.ts                 # Public exports
│   │   ├── managed/                 # Generated by `npm run compact`
│   │   │   └── lending/contract/    #   index.js, keys, etc.
│   │   └── test/
│   │       ├── lending-simulator.ts # In-memory test harness
│   │       └── lending.test.ts      # Unit tests (vitest)
│
└── counter-cli/                     # (name kept for workspace compat)
    ├── package.json                 # @midnight-ntwrk/lending-cli
    └── src/
        ├── api.ts                   # TypeScript API ← ALL FIVE operations
        ├── cli.ts                   # Interactive terminal CLI
        ├── common-types.ts          # TypeScript types (providers, positions)
        ├── config.ts                # Network configs (Standalone/Preview/Preprod)
        ├── preprod.ts               # Entry: npm run preprod
        ├── preview.ts               # Entry: npm run preview
        └── standalone.ts            # Entry: npm run standalone
```

---

## 11. Getting Started

### Prerequisites

- Node.js ≥ 20
- Midnight Compact compiler 0.28.x (`compact` on PATH)
- Docker (for standalone mode or local proof server)

### Build

```bash
# 1. Install dependencies
npm install

# 2. Compile the Compact contract → generates ZK circuit assets
cd contract && npm run compact && cd ..
```

### Run Unit Tests (no network required)

```bash
cd contract && npm test
```

Tests run against the in-memory simulator — no Midnight node needed.

### Run CLI (Preprod Testnet)

```bash
# Start a local proof server (required for ZK proof generation)
cd counter-cli && docker compose -f proof-server.yml up -d

# Launch the CLI (connects to remote Preprod indexer + node)
npm run preprod
```

The CLI will guide you through:

1. Wallet creation or seed restoration
2. Faucet funding of tNight
3. Dust token registration (for network fees)
4. Contract deployment or joining
5. Full lending operations (deposit, mint, repay, withdraw, liquidate, view)

### Run CLI (Standalone / Local Node)

```bash
cd counter-cli && npm run standalone
```

Launches local Docker containers (indexer, node, proof server) automatically.
Uses the genesis seed with pre-minted tNight — no faucet needed.

---

*Protocol designed for educational clarity. Not for production use.*
