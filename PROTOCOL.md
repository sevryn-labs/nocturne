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
 │─── depositCollateral ──────►│  totalCollateral += amount        │
 │                             │──── increment (disclosed) ──────► │
 │                             │  (private: myCollateral +=)       │
 │                             │                                    │
 │─── mintPUSD ────────────────►│  check: coll * 100 >= debt * 150 │
 │                             │──── totalDebt += ───────────────► │
 │                             │  (private: myDebt +=)             │
 │                             │                                    │
 │─── repayPUSD ───────────────►│  check: myDebt >= amount         │
 │                             │──── totalDebt -= ───────────────► │
 │                             │  (private: myDebt -=)             │
 │                             │                                    │
 │─── withdrawCollateral ──────►│  check: coll ratio still ≥ 150%  │
 │                             │──── totalCollateral -= ─────────► │
 │                             │  (private: myCollateral -=)       │
```

pUSD is a **transferable synthetic stablecoin** implemented as an ERC-20-style 
fungible token directly on the public ledger. It tracks `_balances`, `_allowances`, 
and an immutable `_totalSupply`. Users can `transfer`, `approve`, and `transferFrom` 
the pUSD token just like any typical cryptocurrency mapping, but seamlessly integrated 
side-by-side with their Midnight ZK lending positions.

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
witness collateralAmount(): Uint<64>;
witness debtAmount():       Uint<64>;
```

On the other hand, the **pUSD Token** mechanics (`_balances`, `_allowances`) 
are entirely public, mapping `ZswapCoinPublicKey` to balances. This ensures 
pUSD mimics expected transparency of circulating fungible currency models.

The TypeScript `witnesses` object (in `witnesses.ts`) supplies concrete values
from the local DB. The Compact runtime generates a **ZK proof** that the
circuit constraints hold (e.g. the ratio is ≥ 150%) without revealing the
actual collateral/debt values to the verifier or to any on-chain observer.

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
export ledger totalDebt:       Counter;  // Total pUSD outstanding in lending positions
export ledger liquidationRatio: Counter; // 150 = 150%
export ledger mintingRatio:    Counter;  // 150 = 150%

// Token standard fields
export ledger _totalSupply:    Counter;
export ledger _decimals:       Uint<8>;
export ledger _balances:       Map<Bytes<32>, Uint<128>>;
export ledger _allowances:     Map<AllowanceKey, Uint<128>>;
```

### Private State per User (`witnesses.ts`)

```typescript
export type LendingPrivateState = {
  collateralAmount: bigint;  // tNight deposited by this user
  debtAmount:       bigint;  // pUSD borrowed by this user
};
```

Stored in local LevelDB, keyed by `'lendingPrivateState'`.

### Witness Functions

Witnesses are read-only synchronous functions conforming to the Compact 0.20.x
`(context: WitnessContext<Ledger, PS>) => [PS, returnType]` signature:

```typescript
export const witnesses = {
  collateralAmount: (context) => [context.privateState, context.privateState.collateralAmount],
  debtAmount:       (context) => [context.privateState, context.privateState.debtAmount],
};
```

Private state updates happen explicitly in `api.ts` **after** the transaction
confirms on-chain, so that on-chain failures do not corrupt local state.

---

## 5. Contract Circuits

### Compact 0.20.x Design Notes

**Division:** Not supported in Compact circuit arithmetic. All ratio checks are
reformulated as multiplications:

```
(collateral * 100) / debt >= 150
  ↔  collateral * 100 >= debt * 150    (multiply both sides by debt > 0)
```

**`disclose()`:** Compact 0.20.x requires every value flowing through a witness
that subsequently feeds into a ledger operation to be wrapped in `disclose()`.
This explicitly marks the value as acceptable-to-reveal. Private values
(collateral/debt balances) used only inside `assert()` do NOT require disclosure.

---

### `constructor()`

```compact
constructor() {
  liquidationRatio.increment(150 as Uint<16>);
  mintingRatio.increment(150 as Uint<16>);
  _decimals = 18 as Uint<8>;
}
```

Sets protocol parameters once at deploy time. Both ratios start at 150%.

---

### `depositCollateral(amount: Uint<64>)`

```compact
export circuit depositCollateral(amount: Uint<64>): [] {
  assert(amount > 0, "Deposit amount must be positive");

  // Read private state — never leaves the ZK proof
  const myCollateral = collateralAmount();

  // Prove no overflow on the private running balance
  const _ = myCollateral + amount;

  // Update public aggregate — `disclose` is required because `amount`
  // is a circuit argument (treated as witness-derived by the compiler)
  totalCollateral.increment(disclose(amount) as Uint<16>);
}
```

Increases the protocol's total collateral counter.
The user's private collateral balance is updated by the TypeScript API layer
after the transaction confirms.

---

### `mintPUSD(amount: Uint<64>)`

```compact
export circuit mintPUSD(amount: Uint<64>): [] {
  assert(amount > 0, "Mint amount must be positive");

  const myCollateral = collateralAmount();
  const myDebt       = debtAmount();
  const newDebt      = myDebt + amount;

  // Ratio check: collateral * 100 >= newDebt * 150
  // Equivalent to: (collateral * 100) / newDebt >= 150 (without division)
  const ratio: Uint<64> = mintingRatio as Uint<64>;
  assert(myCollateral * 100 >= newDebt * ratio,
         "Insufficient collateral: ratio below minting threshold");

  totalDebt.increment(disclose(amount) as Uint<16>);
  
  // Mint fungible pUSD token to the caller's Zswap key
  _mint(sender, amount as Uint<128>);
}
```

The ZK proof demonstrates that `myCollateral × 100 ≥ (myDebt + amount) × 150`
without revealing `myCollateral` or `myDebt`.

---

### `repayPUSD(amount: Uint<64>)`

```compact
export circuit repayPUSD(amount: Uint<64>): [] {
  assert(amount > 0, "Repay amount must be positive");

  const myDebt = debtAmount();
  assert(myDebt >= amount, "Cannot repay more than outstanding debt");

  totalDebt.decrement(disclose(amount) as Uint<16>);
  
  // Burn the token from caller's public token balance
  _burn(sender, amount as Uint<128>);
}
```

Reduces the caller's debt. In a token-enabled variant, this would also require
pUSD to be sent in (e.g. via a token burn mechanism).

---

### `withdrawCollateral(amount: Uint<64>)`

```compact
export circuit withdrawCollateral(amount: Uint<64>): [] {
  assert(amount > 0, "Withdrawal amount must be positive");

  const myCollateral = collateralAmount();
  const myDebt       = debtAmount();

  assert(myCollateral >= amount, "Cannot withdraw more than deposited collateral");

  const remaining: Uint<64> = (myCollateral - amount) as Uint<64>;
  const ratio: Uint<64>     = liquidationRatio as Uint<64>;

  // Branchless ratio check:
  // When myDebt == 0: remaining * 100 >= 0 * ratio (always true).
  // When myDebt  > 0: enforces the 150% floor.
  // This avoids an `if (myDebt > 0)` branch that the compiler flags as
  // potentially disclosing the private debt value through a conditional.
  assert(remaining * 100 >= myDebt * ratio,
         "Withdrawal would breach liquidation ratio");

  totalCollateral.decrement(disclose(amount) as Uint<16>);
}
```

**Design note:** A naive implementation would use `if (myDebt > 0) { ... }` for
the ratio check, but Compact's privacy analysis flags conditionals on private
values — the branch taken could leak information about whether the user has
debt. The branchless formulation is equivalent (when `myDebt == 0`, the RHS is
zero, so the assertion always passes) and avoids any information leakage.

---

### `liquidate(victimCollateral, victimDebt: Uint<64>)`

```compact
export circuit liquidate(victimCollateral: Uint<64>, victimDebt: Uint<64>): [] {
  assert(victimDebt       > 0, "Cannot liquidate a position with no debt");
  assert(victimCollateral > 0, "Cannot liquidate a position with no collateral");

  const ratio: Uint<64> = liquidationRatio as Uint<64>;

  // Undercollateralised iff: victimCollateral * 100 < victimDebt * 150
  assert(victimCollateral * 100 < victimDebt * ratio,
         "Position is not undercollateralised");

  totalCollateral.decrement(disclose(victimCollateral) as Uint<16>);
  totalDebt.decrement(disclose(victimDebt) as Uint<16>);
  
  // Liquidator must hold the pUSD required to close out the position
  _burn(sender, victimDebt as Uint<128>);
}
```

---

### Token Circuits (`transfer`, `approve`, `transferFrom`)

These public circuits conform directly to OpenZeppelin standard `FungibleToken` logic ported to Compact structure. Because Compact currently (0.20/0.28) lacks local nested `Map` support, allowances utilize a flattened structure using an `AllowanceKey { owner: Bytes<32>, spender: Bytes<32> }`.

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

**Important in-circuit distinction:** The circuit formulation uses
multiplication (`collateral * 100 >= debt * 150`) rather than division, since
Compact 0.20.x does not support division. The math above describes the
*equivalent* division form for human readability.

---

## 7. Liquidation Mechanics

A position becomes liquidatable when:

```
(collateral × 100) / debt < 150

Equivalently (in-circuit): collateral * 100 < debt * 150
```

The liquidator:
1. Observes an undercollateralised position (via off-chain keeper or monitoring).
2. Calls `liquidate(victimCollateral, victimDebt)`.
3. The circuit verifies the ratio is genuinely `< 150%`.
4. The victim's `victimCollateral` is decremented from `totalCollateral`.
5. The victim's `victimDebt` is decremented from `totalDebt`.

In this MVP, the liquidator receives accounting credit — the protocol's
public counters are reduced. Production variants would implement:
- Partial liquidation (liquidate a portion of the position)
- A liquidation penalty (e.g. 13%)
- A stability fee
- Actual token transfer of the seized collateral

---

## 8. End-to-End Flow: Deposit → Mint → Repay → Withdraw

```
Step 1: Deposit 3000 tNight
─────────────────────────────────────────────────────────
  Private state after:  collateral=3000, debt=0
  Public state after:   totalCollateral=3000, totalDebt=0

Step 2: Mint 2000 pUSD
─────────────────────────────────────────────────────────
  Ratio check: 3000 * 100 >= 2000 * 150  →  300000 >= 300000  ✓ (exactly at limit)
  Private state after:  collateral=3000, debt=2000
  Public state after:   totalCollateral=3000, totalDebt=2000

Step 3: Repay 2000 pUSD
─────────────────────────────────────────────────────────
  Assert: myDebt (2000) >= amount (2000) ✓
  Private state after:  collateral=3000, debt=0
  Public state after:   totalCollateral=3000, totalDebt=0

Step 4: Withdraw 3000 tNight
─────────────────────────────────────────────────────────
  No debt → ratio check: 3000 * 100 >= 0 * 150  →  300000 >= 0  ✓ (always passes)
  Private state after:  collateral=0, debt=0
  Public state after:   totalCollateral=0, totalDebt=0

All steps complete. Protocol returns to empty state. ✓
```

---

## 9. Security Properties

| Property                        | Enforced by                                     |
|---------------------------------|-------------------------------------------------|
| No undercollateralised minting  | `assert(myCollateral * 100 >= newDebt * ratio)` in `mintPUSD` circuit |
| No over-withdrawal              | Branchless ratio check in `withdrawCollateral` circuit |
| No repaying more than owed      | `assert(myDebt >= amount)` in `repayPUSD` circuit |
| No double-spending              | Midnight ledger UTXO model                      |
| No invalid liquidation          | `assert(victimCollateral * 100 < victimDebt * ratio)` in `liquidate` circuit |
| Borrower identity privacy       | Private state never touches public ledger        |
| Debt amount privacy             | Witness-only; proven in ZK, not revealed         |
| No information leakage from branches | Branchless design — no `if` on private values |
| Value disclosure is explicit    | `disclose()` marks which values may be revealed  |

---

## 10. Repository Structure

```
lending_protocol/
├── contract/
│   ├── package.json                 # @midnight-ntwrk/lending-contract
│   ├── src/
│   │   ├── lending.compact          # Compact smart contract ← CORE
│   │   ├── witnesses.ts             # Private state type + witness functions
│   │   ├── index.ts                 # Public exports + Lending namespace
│   │   ├── managed/                 # Generated by `npm run compact`
│   │   │   └── lending/contract/    #   index.js, keys, zkir
│   │   └── test/
│   │       ├── lending-simulator.ts # In-memory test harness
│   │       └── lending.test.ts      # Unit tests (vitest, 30 tests)
│
└── lending-cli/
    ├── package.json                 # @midnight-ntwrk/lending-cli
    ├── standalone.yml               # Docker Compose: full local stack
    ├── proof-server.yml             # Docker Compose: proof server only
    └── src/
        ├── api.ts                   # TypeScript API ← ALL FIVE operations
        ├── cli.ts                   # Interactive terminal CLI
        ├── common-types.ts          # TypeScript types (providers, positions)
        ├── config.ts                # Network configs (Standalone/Preview/Preprod)
        ├── logger-utils.ts          # Pino logger setup
        ├── preprod.ts               # Entry: npm run preprod
        ├── preprod-start-proof-server.ts  # Entry: npm run preprod-ps
        ├── preview.ts               # Entry: npm run preview
        ├── preview-start-proof-server.ts  # Entry: npm run preview-ps
        └── standalone.ts            # Entry: npm run standalone
```

---

## 11. Getting Started

### Prerequisites

- Node.js ≥ 20 (v22+ recommended for full wallet SDK compatibility)
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

Tests run against the in-memory `LendingSimulator` — no Midnight node needed.

### Run CLI (Preprod Testnet)

```bash
# Start a local proof server (required for ZK proof generation)
cd lending-cli && docker compose -f proof-server.yml up -d

# Launch the CLI (connects to remote Preprod indexer + node)
npm run preprod
```

Or use the combined command that auto-starts the proof server:

```bash
cd lending-cli && npm run preprod-ps
```

The CLI will guide you through:

1. Wallet creation or seed restoration
2. Faucet funding of tNight
3. Dust token registration (for network fees)
4. Contract deployment or joining
5. Full lending operations (deposit, mint, repay, withdraw, liquidate, view)

### Run CLI (Standalone / Local Node)

```bash
cd lending-cli && npm run standalone
```

Launches local Docker containers (indexer, node, proof server) automatically.
Uses the genesis seed with pre-minted tNight — no faucet needed.

---

*Protocol designed for educational clarity. Not for production use.*
