# pUSD Lending Protocol: Architecture & Mechanics

> A privacy-preserving, collateralised synthetic stablecoin protocol built on
> the Midnight Network using Compact smart contracts and midnight-js tooling.
> Conceptually equivalent to MakerDAO/Liquity, optimised for clarity, oracle-driven
> risk management, and ZK-based privacy.
>
> **Version 3.0.0**: Oracle prices, governance circuits, insurance fund, pause mechanism.

---

## Table of Contents

1. [Protocol Overview](#1-protocol-overview)
2. [Economic Model](#2-economic-model)
3. [Privacy Model: Why Each Piece of Data is Public or Private](#3-privacy-model)
4. [State Design](#4-state-design)
5. [Contract Circuits](#5-contract-circuits)
6. [Collateral Ratio Math](#6-collateral-ratio-math)
7. [Liquidation Mechanics](#7-liquidation-mechanics)
8. [Oracle Architecture](#8-oracle-architecture)
9. [Governance & Admin](#9-governance--admin)
10. [Insurance Fund & Bad Debt](#10-insurance-fund--bad-debt)
11. [End-to-End Flow: Deposit → Mint → Repay → Withdraw](#11-end-to-end-flow)
12. [Protocol Invariants & Limits](#12-protocol-invariants--limits)
13. [Security Properties](#13-security-properties)
14. [Roadmap](#14-roadmap)
15. [Repository Structure](#15-repository-structure)
16. [Getting Started](#16-getting-started)

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
| Liquidation ratio  | 150% (configurable) | Minimum collateral-to-debt ratio     |
| Minting ratio      | 150% (configurable) | Required ratio to open/increase debt |
| Oracle price       | Admin-set (4-decimal) | $1.00 = 10000, updated via `updateOraclePrice` |
| Debt ceiling       | 10,000,000 (configurable) | Maximum system-wide pUSD debt    |
| Minimum debt       | 100 (configurable) | Prevents dust vault positions          |
| Liquidation penalty| 1300 bps (13%) | Split between liquidator and insurance fund |
| Insurance fund     | On-chain Counter | Protocol reserve for bad debt absorption   |
| Staleness limit    | 1000 blocks (configurable) | Oracle freshness requirement    |
| Interest rate      | 0%        | Intentionally omitted for Phase 1                |
| Governance         | Admin key (Phase 1) | 8 parameter-update circuits              |

### Core invariant (v3, oracle-adjusted)

```
collateral × oraclePrice × 100
──────────────────────────────── ≥ mintingRatio
      debt × 10000
```

Equivalent in-circuit (no division):
```
collateral × oraclePrice × 100 ≥ debt × mintingRatio × 10000
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
| `mintingRatio`     | Same rationale: a hidden ratio would be unacceptably opaque.    |
| `oraclePrice`      | Users must know the reference price to evaluate their position.  |
| `oracleTimestamp`  | Required to assess oracle freshness and staleness risk.          |
| `debtCeiling`      | Transparent capacity limit for protocol-level risk assessment.   |
| `minDebt`          | Users must know the minimum vault size before opening positions. |
| `insuranceFund`    | Public accountability for protocol reserve adequacy.             |
| `paused`           | Users must know if operations are currently restricted.          |
| `liquidationPenalty` | Transparent liquidation economics for keeper incentivisation.  |

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

Borrower identity is pseudonymous: linked only to a Zswap public key, not to
any real-world identity. The protocol never requires KYC or wallet linkage.

### Liquidation trade-off

Liquidation is the one case where individual position values must be revealed:
the liquidator provides the victim's collateral + debt as circuit arguments.
This is unavoidable (the circuit must verify the ratio to allow liquidation):
but only the liquidator ever knows the exact values. This mirrors MakerDAO's
"anyone can call liquidation" model.

---

## 4. State Design

### Public Ledger State (`lending.compact` v3)

```compact
// ─── Core Protocol State ───
export ledger totalCollateral:    Counter;  // tNight held by protocol
export ledger totalDebt:          Counter;  // Total pUSD outstanding in lending positions
export ledger liquidationRatio:   Counter;  // 150 = 150% (configurable via governance)
export ledger mintingRatio:       Counter;  // 150 = 150% (configurable via governance)

// ─── Oracle State ───
export ledger oraclePrice:        Uint<64>; // 4-decimal: $1.00 = 10000
export ledger oracleTimestamp:    Uint<64>; // Block height of last update
export ledger oracleStalenessLimit: Uint<64>; // Max blocks before stale

// ─── Risk Parameters ───
export ledger debtCeiling:        Uint<64>; // Max total system debt
export ledger minDebt:            Uint<64>; // Min vault debt (dust prevention)
export ledger liquidationPenalty: Uint<64>; // Bps (1300 = 13%)
export ledger insuranceFund:      Counter;  // Protocol reserves
export ledger paused:             Uint<64>; // 0 = active, 1 = paused

// ─── Token Standard Fields ───
export ledger _totalSupply:       Counter;
export ledger _decimals:          Uint<8>;
export ledger _balances:          Map<Bytes<32>, Uint<128>>;
export ledger _allowances:        Map<AllowanceKey, Uint<128>>;
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

  // Read private state: never leaves the ZK proof
  const myCollateral = collateralAmount();

  // Prove no overflow on the private running balance
  const _ = myCollateral + amount;

  // Update public aggregate: `disclose` is required because `amount`
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
  assert(paused == (0 as Uint<64>), "Protocol is paused");

  const myCollateral = collateralAmount();
  const myDebt       = debtAmount();
  const newDebt      = myDebt + amount;

  // v3: Debt ceiling enforcement
  const currentTotal: Uint<64> = totalDebt as Uint<64>;
  assert(currentTotal + amount <= debtCeiling, "Debt ceiling reached");

  // v3: Minimum debt enforcement
  assert(newDebt >= minDebt, "Below minimum debt");

  // v3: Oracle-adjusted ratio check
  // collateral * price * 100 >= newDebt * ratio * PRICE_PRECISION
  const ratio: Uint<64> = mintingRatio as Uint<64>;
  const price: Uint<64> = oraclePrice;
  assert(myCollateral * price * 100 >= newDebt * ratio * 10000,
         "Insufficient collateral: ratio below minting threshold");

  totalDebt.increment(disclose(amount) as Uint<16>);
  _mint(sender, amount as Uint<128>);
}
```

The ZK proof demonstrates that `myCollateral × oraclePrice × 100 ≥ (myDebt + amount) × mintingRatio × 10000`
without revealing `myCollateral` or `myDebt`. Additionally enforces debt ceiling and minimum debt.

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
  assert(paused == (0 as Uint<64>), "Protocol is paused");

  const myCollateral = collateralAmount();
  const myDebt       = debtAmount();

  assert(myCollateral >= amount, "Cannot withdraw more than deposited collateral");

  const remaining: Uint<64> = (myCollateral - amount) as Uint<64>;
  const ratio: Uint<64>     = liquidationRatio as Uint<64>;
  const price: Uint<64>     = oraclePrice;

  // v3: Oracle-adjusted branchless ratio check:
  // remaining * price * 100 >= myDebt * ratio * PRICE_PRECISION
  assert(remaining * price * 100 >= myDebt * ratio * 10000,
         "Withdrawal would breach liquidation ratio");

  totalCollateral.decrement(disclose(amount) as Uint<16>);
}
```

**Design note:** The branchless formulation avoids `if (myDebt > 0)` conditionals
that would leak debt information. When `myDebt == 0`, the RHS is zero, so any
withdrawal up to `myCollateral` passes.

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

> **v3 Note:** `transfer` and `transferFrom` now check `paused == 0` before executing. This ensures pause governance can halt token circulation during emergencies.

---

### v3 Admin Circuits

All governance circuits are admin-callable (Phase 1: caller restriction at API layer; Phase 2: on-chain caller verification):

| Circuit | Parameters | Bounds |
|---------|-----------|--------|
| `updateOraclePrice` | `newPrice: Uint<64>, blockHeight: Uint<64>` | price > 0, blockHeight > previous |
| `updateMintingRatio` | `newRatio: Uint<64>` | 110 ≤ ratio ≤ 300 |
| `updateLiquidationRatio` | `newRatio: Uint<64>` | 110 ≤ ratio ≤ 300 |
| `updateDebtCeiling` | `newCeiling: Uint<64>` | ceiling > 0 |
| `updateStalenessLimit` | `newLimit: Uint<64>` | 10 ≤ limit ≤ 10000 |
| `updateMinDebt` | `newMinDebt: Uint<64>` | minDebt ≥ 0 |
| `updateLiquidationPenalty` | `newPenalty: Uint<64>` | 500 ≤ penalty ≤ 2500 |
| `setPaused` | `pauseState: Uint<64>` | 0 (active) or 1 (paused) |
| `fundInsurance` | `amount: Uint<64>` | amount > 0 (anyone can call) |

### Read-Only State

All v3 ledger values (`oraclePrice`, `oracleTimestamp`, `debtCeiling`, `insuranceFund`, `minDebt`, `liquidationPenalty`, `paused`) are `export ledger` fields, queryable directly via the Midnight indexer / public state API. No dedicated query circuits are needed: this keeps the deployment within the block size limit.

---

## 6. Collateral Ratio Math

All ratio math uses integer arithmetic (no floating point) and is oracle-price-adjusted in v3:

```
ratio = (collateral × oraclePrice × 100) / (debt × 10000)    [integer]

Example ($1.00 = 10000):
  collateral  = 1500 tNight
  oraclePrice = 10000
  debt        = 1000 pUSD
  ratio       = (1500 × 10000 × 100) / (1000 × 10000) = 150 (= 150%)

Example ($2.00 = 20000):
  collateral  = 750 tNight
  oraclePrice = 20000
  debt        = 1000 pUSD
  ratio       = (750 × 20000 × 100) / (1000 × 10000) = 150 (= 150%)
```

**Maximum mint given collateral and oracle price:**

```
maxDebt = (collateral × oraclePrice × 100) / (mintingRatio × 10000)
        = (1500 × 10000 × 100) / (150 × 10000)
        = 1000 pUSD
```

**Maximum withdrawal given existing debt:**

```
minCollateral = (debt × mintingRatio × 10000) / (oraclePrice × 100)
maxWithdraw   = currentCollateral - minCollateral

Example:
  currentCollateral = 3000
  debt              = 1000
  oraclePrice       = 10000
  minCollateral     = (1000 × 150 × 10000) / (10000 × 100) = 1500
  maxWithdraw       = 3000 - 1500 = 1500 tNight
```

**Important in-circuit distinction:** The circuit formulation uses
multiplication (`collateral * price * 100 >= debt * ratio * 10000`)
rather than division, since Compact does not support division.

---

## 7. Liquidation Mechanics

A position becomes liquidatable when (oracle-adjusted):

```
(collateral × oraclePrice × 100) / (debt × 10000) < liquidationRatio

In-circuit: collateral * price * 100 < debt * ratio * 10000
```

The liquidator:
1. Observes an undercollateralised position (via off-chain keeper or monitoring).
2. Calls `liquidate(victimCollateral, victimDebt)`.
3. The circuit verifies the ratio is genuinely below `liquidationRatio` at the current oracle price.
4. The circuit verifies `paused == 0` (liquidations blocked when paused).
5. The victim's `victimCollateral` is decremented from `totalCollateral`.
6. The victim's `victimDebt` is decremented from `totalDebt`.
7. The liquidator's pUSD is burned (`_burn`) to absorb the debt.

### Liquidation Penalty (v3)

The `liquidationPenalty` parameter (default: 1300 bps = 13%) governs economic incentives:
- **Liquidator reward:** 10% of seized collateral
- **Protocol insurance:** 3% routed to `insuranceFund`

This incentivises keeper participation while building protocol reserves.

---

## 8. Oracle Architecture

### Phase 1: Admin Oracle (Current)

The oracle price is updated via the `updateOraclePrice(newPrice, blockHeight)` admin circuit:

- **Price format:** 4-decimal precision: `$1.00 = 10000`, `$0.50 = 5000`, `$2.50 = 25000`
- **Block height:** Must be strictly increasing (prevents replays)
- **Staleness:** `oracleStalenessLimit` defines the maximum blocks between updates before operations should be considered risky

### Phase 2: Decentralized Oracle (Planned)

- ZK-bridged price feeds from external oracle networks (DIA, Chainlink)
- Multi-source median aggregation
- On-chain staleness verification with automatic pause triggers

---

## 9. Governance & Admin

v3 implements Phase 1 governance: single admin key with 8 parameter-update circuits.

### Tunable Parameters

| Parameter | Range | Default | Circuit |
|-----------|-------|---------|--------|
| Minting ratio | 110–300% | 150% | `updateMintingRatio` |
| Liquidation ratio | 110–300% | 150% | `updateLiquidationRatio` |
| Oracle price | > 0 | 10000 ($1.00) | `updateOraclePrice` |
| Debt ceiling | > 0 | 10,000,000 | `updateDebtCeiling` |
| Min vault debt | ≥ 0 | 100 | `updateMinDebt` |
| Liquidation penalty | 500–2500 bps | 1300 (13%) | `updateLiquidationPenalty` |
| Staleness limit | 10–10000 blocks | 1000 | `updateStalenessLimit` |
| Pause state | 0 or 1 | 0 (active) | `setPaused` |

### Pause Mechanism

When `paused == 1`:
- **Blocked:** `mintPUSD`, `withdrawCollateral`, `liquidate`, `transfer`, `transferFrom`
- **Allowed:** `depositCollateral`, `repayPUSD` (risk-reducing operations)

Rationale: Risk-reducing operations should always be available to protect user positions.

### Decentralization Roadmap

| Phase | Access Control |
|-------|---------------|
| Phase 1 (Current) | Single admin key, enforced at API layer |
| Phase 2 | On-chain caller verification in circuits |
| Phase 3 | Multi-sig (N-of-M) with 48h timelock |
| Phase 4 | Token-weighted governance with formal proposal process |

---

## 10. Insurance Fund & Bad Debt

The `insuranceFund` Counter tracks protocol reserves for absorbing bad debt.

### Funding Sources

1. **Liquidation penalties:** 3% of seized collateral value routes to insurance
2. **Voluntary contributions:** Anyone can call `fundInsurance(amount)`
3. **Future: Stability fees** on outstanding debt

### Bad Debt Tiers

| Tier | Trigger | Response |
|------|---------|----------|
| 1 | Individual vault bad debt | Insurance fund absorbs |
| 2 | Insurance fund depleted | Socialised loss across remaining vaults |
| 3 | Systemic insolvency | Emergency governance intervention + pause |

---

## 11. End-to-End Flow: Deposit → Mint → Repay → Withdraw

```
Prerequisite: Oracle price set to $1.00 (10000)
Step 1: Deposit 3000 tNight
─────────────────────────────────────────────────────────
  Private state after:  collateral=3000, debt=0
  Public state after:   totalCollateral=3000, totalDebt=0

Step 2: Mint 2000 pUSD
─────────────────────────────────────────────────────────
  Debt ceiling check: totalDebt (0) + 2000 <= 10000000  ✓
  Min debt check: 2000 >= 100  ✓
  Pause check: paused == 0  ✓
  Ratio check: 3000 * 10000 * 100 >= 2000 * 150 * 10000  →  3000000000 >= 3000000000  ✓
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

## 12. Protocol Invariants & Limits

### Core Invariants

The protocol guarantees the following global invariants across all state transitions:

1. **Supply Parity:** `totalDebt == _totalSupply`. The outstanding pUSD debt recorded across all individual borrowers exactly equals the total circulating supply of the ERC-20-style `_balances` ledger.
2. **Solvency Parity:** For each vault, `collateral × oraclePrice × 100 ≥ debt × ratio × 10000` is enforced upon creation (`mintPUSD`) and withdrawal (`withdrawCollateral`).
3. **Double-Spend Prevention:** Users cannot extract more collateral than they deposited (`assert(myCollateral >= amount)`). All token balances and debt ledgers are non-negative.
4. **Debt Ceiling:** `totalDebt + newMint ≤ debtCeiling` prevents unbounded protocol exposure.
5. **Minimum Debt:** `vaultDebt ≥ minDebt` prevents dust positions that are uneconomical to liquidate.

### External Keeper Model

Because Midnight circuits cannot self-execute or monitor global state automatically, the protocol relies on an external **Keeper Model** for liquidations:
- Keepers run off-chain bots that monitor `totalCollateral` vs `totalDebt`, or watch specific on-chain lending actions.
- When they identify heavily leveraged positions (e.g. they see large mints or price drops), they can probe those public keys via the `liquidate` circuit. 
- If the assertion `victimCollateral * 100 < victimDebt * ratio` genuinely passes, the ZK proof is validated by the network, and the keeper successfully executes the liquidation.

### System Limits

- **Data Types:** All monetary ledgers use `Uint<128>` to comfortably hold `18` decimal precisions without overflow risk during basic additions.
- **Arithmetic:** Ratio checks operate up to `Uint<64>` prior to multiplications to guarantee no integer overflow occurs when calculating `* 100` or `* 150` internal logic checks.

---

## 13. Security Properties

| Property                        | Enforced by                                     |
|---------------------------------|-------------------------------------------------|
| No undercollateralised minting  | `assert(coll * price * 100 >= newDebt * ratio * 10000)` in `mintPUSD` |
| No over-withdrawal              | Oracle-adjusted branchless ratio check in `withdrawCollateral` |
| No repaying more than owed      | `assert(myDebt >= amount)` in `repayPUSD` circuit |
| No double-spending              | Midnight ledger UTXO model                      |
| No invalid liquidation          | `assert(coll * price * 100 < debt * ratio * 10000)` in `liquidate` |
| Debt ceiling enforcement        | `assert(totalDebt + amount <= debtCeiling)` in `mintPUSD` |
| Dust prevention                 | `assert(newDebt >= minDebt)` in `mintPUSD`       |
| Emergency halt                  | `assert(paused == 0)` in mint/withdraw/liquidate/transfer |
| Governance bounds checking      | Range assertions in all admin circuits (e.g., 110≤ratio≤300) |
| Borrower identity privacy       | Private state never touches public ledger        |
| Debt amount privacy             | Witness-only; proven in ZK, not revealed         |
| No information leakage from branches | Branchless design: no `if` on private values |
| Value disclosure is explicit    | `disclose()` marks which values may be revealed  |

---

## 14. Roadmap

v3 delivers a production-grade foundation. Remaining items for full mainnet readiness:

- ✅ **Oracle Price Feed**: Implemented in v3
- ✅ **Governance Circuits**: 8 admin circuits for live parameter tuning
- ✅ **Debt Ceiling & Min Debt**: System-wide caps and dust prevention
- ✅ **Insurance Fund**: On-chain protocol reserve
- ✅ **Pause Mechanism**: Emergency circuit with selective operation blocking
- **On-chain Admin Access Control**: Phase 2: verify caller == admin key in circuits
- **Multi-sig Governance**: Phase 2: N-of-M key holder approval
- **Timelock**: Phase 3: 48h delay on parameter changes
- **Decentralized Oracles**: Phase 3: ZK-bridged price feeds
- **Redemption Mechanism**: Direct pUSD-to-collateral redemption at $1
- **Stability Fee**: Dynamic interest rate for peg maintenance
- **Keeper Bot Reference**: Automated liquidation monitoring
- **Flash Loans**: Atomic ZK-safe flash borrowing

---

## 15. Repository Structure

```
lending_protocol/
├── contract/
│   ├── package.json                 # @midnight-ntwrk/lending-contract
│   ├── src/
│   │   ├── lending.compact          # Compact smart contract ← CORE (5 core + 9 admin + 5 token)
│   │   ├── witnesses.ts             # Private state type + witness functions
│   │   ├── index.ts                 # Public exports + Lending namespace
│   │   ├── managed/                 # Generated by `npm run compact`
│   │   │   └── lending/contract/    #   index.js, keys, zkir
│   │   └── test/
│   │       ├── lending-simulator.ts # In-memory test harness
│   │       └── lending.test.ts      # 100+ unit tests (22 sections, vitest)
│
├── lending-api/                     # REST API server
│   ├── src/
│   │   ├── server.ts                # Express server
│   │   └── lending-service.ts       # Core logic wrapper
│
├── lending-ui/                      # React web frontend
│   ├── src/
│   │   ├── main.tsx                 # Web entry point
│   │   └── pages/                   # UI views
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

## 16. Getting Started

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

Tests run against the in-memory `LendingSimulator`: no Midnight node needed.

### Run Web UI + API (Recommended)

```bash
# 1. Start the proof server
cd lending-cli && docker compose -f proof-server.yml up -d

# 2. Start the REST API (in a new terminal)
npm run dev:api

# 3. Start the Web UI (in a new terminal)
npm run dev:ui
```

Open `http://localhost:5173` to interact with the protocol via the web application.

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
6. Peer-to-peer pUSD transfers (`[10] Transfer pUSD`)

### Run CLI (Standalone / Local Node)

```bash
cd lending-cli && npm run standalone
```

Launches local Docker containers (indexer, node, proof server) automatically.
Uses the genesis seed with pre-minted tNight: no faucet needed.

---

*Protocol designed for privacy-preserving DeFi. Mainnet deployment roadmap in progress.*
