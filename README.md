# pUSD Lending Protocol

[![Generic badge](https://img.shields.io/badge/Compact%20Toolchain-0.28.0-1abc9c.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/midnight--js-3.0.0-blueviolet.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/wallet--sdk--facade-1.0.0-blue.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/Tests-30%20passing-brightgreen.svg)](https://shields.io/)

A **privacy-preserving collateralised lending protocol** built on the [Midnight Network](https://midnight.network). Deposit tNight as collateral, mint pUSD synthetic stablecoins, and maintain positions privately via zero-knowledge proofs — individual debt and collateral amounts are never exposed on-chain.

> Conceptually equivalent to MakerDAO, built for Midnight's ZK-first architecture.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
- [Using the CLI](#using-the-lending-protocol-cli)
- [Running Tests](#running-tests)
- [Standalone Mode](#standalone-mode-fully-local)
- [Network Targets](#network-targets)
- [Troubleshooting](#troubleshooting)
- [Further Reading](#further-reading)

---

## How It Works

```
Deposit tNight → Mint pUSD (up to 66% of collateral value)
                       ↕
            Collateral ratio ≥ 150% (enforced by ZK proof)
                       ↕
     Repay pUSD → Withdraw tNight
```

### Economic Rules

All rules are enforced entirely inside the Compact ZK circuit — no off-chain trust required:

| Rule | Constraint |
|------|-----------|
| Minimum collateral ratio | `collateral × 100 ≥ debt × 150` |
| Mint cap | `(existingDebt + mintAmount) × 150 ≤ collateral × 100` |
| Withdraw floor | remaining collateral must still satisfy ratio |
| Liquidation guard | position must have ratio `< 150%` to be seized |

> **Arithmetic note:** Division is not supported in Compact 0.20.x, so all ratio checks are reformulated as multiplications (mathematically equivalent).

### Privacy Model

| Data | Visibility | Reason |
|------|-----------|--------|
| `totalCollateral` | 🌐 Public | Protocol solvency audit |
| `totalDebt` | 🌐 Public | Verify no unbacked pUSD |
| `liquidationRatio` / `mintingRatio` | 🌐 Public | Transparent risk parameter |
| **Your collateral** | 🔒 Private | Hidden in ZK — never on-chain |
| **Your debt** | 🔒 Private | Hidden in ZK — never on-chain |
| **Your identity** | 🔒 Private | Pseudonymous (Midnight public key only) |

Private state lives in a user-controlled local LevelDB database and is supplied to ZK circuits via **witness** functions. The Compact runtime generates a zero-knowledge proof that constraints hold without revealing actual values.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CLI (cli.ts)                             │
│  Menu-driven terminal: wallet setup → contract → lending ops    │
└──────────────────────────────┬──────────────────────────────────┘
                               │
┌──────────────────────────────▼──────────────────────────────────┐
│                      TypeScript API (api.ts)                     │
│  Wallet construction · Provider setup · All 5 lending ops        │
│  Private state management (LevelDB read/write)                   │
└────┬──────────────┬──────────────┬──────────────┬───────────────┘
     │              │              │              │
┌────▼────┐  ┌──────▼─────┐  ┌────▼────┐  ┌─────▼──────┐
│ Wallet  │  │  midnight-  │  │  Proof  │  │  Indexer   │
│ Facade  │  │ js-contracts│  │  Server │  │  (public   │
│(3 subs) │  │(deploy/call)│  │  (ZK)   │  │   data)    │
└─────────┘  └──────┬──────┘  └─────────┘  └────────────┘
                    │
        ┌───────────▼───────────┐
        │  Compact ZK Contract  │
        │   (lending.compact)   │
        │                       │
        │  5 circuits:          │
        │  · depositCollateral  │
        │  · mintPUSD           │
        │  · repayPUSD          │
        │  · withdrawCollateral │
        │  · liquidate          │
        └───────────────────────┘
```

The **wallet** is composed of three sub-wallets orchestrated by `WalletFacade`:
- **ShieldedWallet** — ZK-shielded transactions (zswap)
- **UnshieldedWallet** — transparent tNight transactions
- **DustWallet** — dust fee token management

---

## Project Structure

```
lending_protocol/
├── contract/                              # Compact smart contract
│   ├── package.json                       # @midnight-ntwrk/lending-contract
│   ├── src/
│   │   ├── lending.compact                # ← Core protocol (5 ZK circuits)
│   │   ├── witnesses.ts                   # Private state type + witness functions
│   │   ├── index.ts                       # Package entry point + Lending namespace
│   │   └── managed/lending/               # Generated by `npm run compact`
│   │       ├── contract/index.js          #   TypeScript bindings
│   │       ├── keys/                      #   ZK proving/verifying keys
│   │       └── zkir/                      #   Circuit IR files
│   └── src/test/
│       ├── lending-simulator.ts           # In-memory test harness (no network)
│       └── lending.test.ts                # 30 unit tests (vitest)
│
├── lending-cli/                           # CLI & API layer
│   ├── package.json                       # @midnight-ntwrk/lending-cli
│   ├── .env                               # Indexer container env vars
│   ├── standalone.yml                     # Docker Compose: full local stack
│   ├── proof-server.yml                   # Docker Compose: proof server only
│   └── src/
│       ├── api.ts                         # TypeScript API (all 5 operations + wallet)
│       ├── cli.ts                         # Interactive terminal CLI (menus + display)
│       ├── common-types.ts                # Shared types (providers, positions, circuits)
│       ├── config.ts                      # Network configs (Standalone/Preview/Preprod)
│       ├── logger-utils.ts                # Pino logger setup
│       ├── preprod.ts                     # Entry: npm run preprod
│       ├── preprod-start-proof-server.ts  # Entry: npm run preprod-ps (auto proof server)
│       ├── preview.ts                     # Entry: npm run preview
│       ├── preview-start-proof-server.ts  # Entry: npm run preview-ps (auto proof server)
│       └── standalone.ts                  # Entry: npm run standalone (full Docker stack)
│
├── PROTOCOL.md                            # Full protocol documentation
├── MIGRATION_GUIDE.md                     # midnight-js 2.x → 3.0.0 migration guide
├── package.json                           # Root workspace (npm workspaces)
└── README.md                              # This file
```

---

## Prerequisites

- **[Node.js v20+](https://nodejs.org/)** — `node --version` to check
  > Node.js v22+ is recommended for full SDK compatibility. On v20, a few wallet SDK methods use [Iterator Helpers](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Iterator) (`.entries().every()`, `Set.union()`, `.keys().toArray()`) that require manual patching — see [Troubleshooting](#troubleshooting).
- **[Docker](https://docs.docker.com/get-docker/)** with `docker compose` — for the proof server and standalone mode

### Compact Developer Tools

The Compact devtools manage the ZK contract compiler.

```bash
# Install the Compact devtools
curl --proto '=https' --tlsv1.2 -LsSf \
  https://github.com/midnightntwrk/compact/releases/latest/download/compact-installer.sh | sh

# Add to PATH
source $HOME/.local/bin/env

# Install the toolchain version used by this project
compact update 0.28.0

# Verify
compact compile --version
# → 0.28.0
```

> Already installed? Run `compact self update` to get the latest. Use `compact clean` to reset if you encounter issues.

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Build the smart contract

```bash
cd contract
npm run compact    # compile Compact → ZK circuits + TypeScript bindings
npm run build      # tsc compile
npm run test       # run 30 unit tests (no network required)
```

Expected output from `npm run compact`:

```
  circuit "depositCollateral" (k=9, rows=201)
  circuit "mintPUSD"          (k=9, rows=330)
  circuit "repayPUSD"         (k=9, rows=226)
  circuit "withdrawCollateral"(k=9, rows=354)
  circuit "liquidate"         (k=9, rows=316)
```

> The first run downloads zero-knowledge parameters (~500 MB). This is a one-time download cached at `~/.compact/`.

### 3. Launch the CLI

**Option A — Preprod with auto-start proof server (recommended for first run):**

```bash
cd lending-cli
npm run preprod-ps
```

This pulls the proof server Docker image, starts it, then launches the CLI connected to the public Preprod testnet.

**Option B — Preprod with manual proof server:**

```bash
# Terminal 1 — proof server
cd lending-cli && docker compose -f proof-server.yml up

# Terminal 2 — CLI (once proof server shows "listening on 0.0.0.0:6300")
cd lending-cli && npm run preprod
```

**Option C — Fully local standalone (no testnet needed):**

```bash
cd lending-cli
npm run standalone
```

Starts a complete local Midnight stack via Docker Compose (node, indexer, proof server) with a pre-funded genesis wallet — no faucet needed.

---

## Using the Lending Protocol CLI

### Step 1: Create or restore a wallet

```
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║    pUSD Privacy-Preserving Lending Protocol                      ║
║    ─────────────────────────────────────                         ║
║    Built on Midnight Network · Powered by ZK Proofs              ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝

  Wallet Setup
  ────────────────────────────────────────────────────────────
  [1] Create a new wallet (random seed)
  [2] Restore wallet from existing seed
  [3] Exit
```

- Choose **[1]** for a fresh wallet — the CLI prints your seed and unshielded address.
- Choose **[2]** to restore an existing wallet with its 64-hex seed.
- In **standalone mode**, the genesis wallet is loaded automatically (no prompt).

> **Always save your seed.** It's the only way to restore your wallet and your private position data.

### Step 2: Fund your wallet with tNight

1. Copy the **unshielded address** (`mn_addr_preprod1...`) displayed by the CLI.
2. Visit the [Preprod Faucet](https://faucet.preprod.midnight.network).
3. Paste your address and request tNight.
4. The CLI detects incoming funds automatically.

> In standalone mode, the genesis wallet is pre-funded — skip this step.

### Step 3: Wait for DUST

After receiving tNight, the CLI registers your NIGHT UTXOs for DUST generation. DUST is the non-transferable fee resource required for all Midnight transactions.

```
  ✓ Registering 1 NIGHT UTXO(s) for dust generation
  ✓ Waiting for dust tokens to generate
  ✓ Configuring providers
```

### Step 4: Deploy or join a contract

```
  Contract Setup                         DUST: 405,083,000,000,000
  ────────────────────────────────────────────────────────────────
  [1] Deploy a new pUSD Lending contract
  [2] Join an existing pUSD Lending contract
  [3] Monitor DUST balance
  [4] Exit
```

- **[1] Deploy** — creates a new lending protocol on-chain. Save the contract address shown on success.
- **[2] Join** — enter a contract address to interact with an existing deployment.
- **[3] Monitor** — live-stream your DUST balance (useful while waiting for generation).

### Step 5: Lend and borrow

```
  Lending Actions                        DUST: 405,083,000,000,000
  ────────────────────────────────────────────────────────────────
  [1] Deposit Collateral (tNight → protocol)
  [2] Mint pUSD            (borrow against collateral)
  [3] Repay pUSD           (reduce debt)
  [4] Withdraw Collateral  (reclaim tNight)
  [5] Liquidate            (claim undercollateralised position)
  [6] View Protocol State  (public totals)
  [7] View My Position     (private balance)
  [8] Exit
```

**Example flow:**

```
[1] Deposit  3000 tNight   → collateral = 3000, debt = 0
[2] Mint     2000 pUSD     → collateral = 3000, debt = 2000  (ratio = 150% ✓)
[3] Repay    2000 pUSD     → collateral = 3000, debt = 0
[4] Withdraw 3000 tNight   → collateral = 0,    debt = 0  ✓
```

**View My Position** shows your private state (stored locally, never on-chain):

```
  My Private Position
  ──────────────────────────────────────────────────────────────
  Collateral (tNight) : 3,000
  Debt (pUSD)         : 2,000
  Collateral Ratio    : 150%
  Health              : ✓ Healthy (ratio ≥ 150%)
```

**View Protocol State** shows the public on-chain totals:

```
  Public Protocol State
  ──────────────────────────────────────────────────────────────
  Total Collateral (tNight) : 3,000
  Total pUSD Debt           : 2,000
  Liquidation Ratio         : 150%
  Minting Ratio             : 150%
```

### Collateral Ratio Quick Reference

| Collateral | Max Mintable pUSD | Ratio |
|-----------|------------------|-------|
| 1,500 | 1,000 | 150% (minimum) |
| 3,000 | 2,000 | 150% |
| 10,000 | 6,666 | 150% |

Formula: `maxDebt = (collateral × 100) / 150`

---

## Running Tests

```bash
cd contract
npm test
```

```
 ✓ src/test/lending.test.ts (30 tests) 363ms
   ✓ Lending contract — Initialisation (4)
   ✓ depositCollateral (4)
   ✓ mintPUSD (6)
   ✓ repayPUSD (4)
   ✓ withdrawCollateral (6)
   ✓ liquidate (4)
   ✓ End-to-end: Deposit → Mint → Repay → Withdraw (2)

 Tests  30 passed (30)
```

Tests run against the `LendingSimulator` — an in-memory harness that wraps the Compact-generated contract. No Midnight node, no proof server, no Docker needed.

---

## Standalone Mode (fully local)

```bash
cd lending-cli
npm run standalone
```

Starts a complete local Midnight stack via Docker Compose:

| Container | Image | Purpose |
|-----------|-------|---------|
| `lending-node` | `midnightntwrk/midnight-node:0.20.0` | Local Midnight node |
| `lending-indexer` | `midnightntwrk/indexer-standalone:3.0.0` | Block indexer + GraphQL API |
| `lending-proof-server` | `midnightntwrk/proof-server:7.0.0` | ZK proof generation |

Uses the genesis seed (`0...01`) with pre-minted tNight — no faucet needed.

---

## Network Targets

| Network | Description | Command | Proof Server |
|---------|-------------|---------|-------------|
| **Standalone** | Fully local (Docker) | `npm run standalone` | Included in Docker stack |
| **Preview** | Public preview testnet | `npm run preview-ps` | Auto-started via Docker |
| **Preprod** | Public preprod testnet | `npm run preprod-ps` | Auto-started via Docker |

For manual proof server management, use the `-ps`-less variants (`preview`, `preprod`) and start the proof server separately:

```bash
cd lending-cli && docker compose -f proof-server.yml up -d
```

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| `compact: command not found` | Run `source $HOME/.local/bin/env` to add it to your PATH |
| `connect ECONNREFUSED 127.0.0.1:6300` | Start the proof server: `cd lending-cli && docker compose -f proof-server.yml up` |
| `imbalances.fallible.entries(...).every is not a function` | **Node.js v20 compatibility issue.** The wallet SDK uses Iterator Helpers (Node 22+). Patch `node_modules/@midnight-ntwrk/wallet-sdk-shielded/dist/v1/TransactionImbalances.js`: wrap `.entries().every()` calls with `Array.from()`. Also patch `Imbalances.js` (`Set.union()` → spread syntax) and `TransactionOps.js` (`.keys().toArray()` → `Array.from()`). Or upgrade to Node.js v22+. |
| `Insufficient collateral: ratio below minting threshold` | Your collateral ratio would drop below 150% after minting. Deposit more collateral first. Formula: need `collateral ≥ (currentDebt + mintAmount) × 1.5` |
| `Withdrawal would breach liquidation ratio` | Withdrawing would push your ratio below 150%. Repay some debt first. |
| Proof server hangs on Mac ARM (Apple Silicon) | Docker Desktop → Settings → General → "Virtual Machine Options" → select **Docker VMM**. Restart Docker. |
| `Failed to clone intent` during deploy | Wallet SDK signing bug — already worked around in this codebase (see `signTransactionIntents` in `api.ts`) |
| DUST balance drops to 0 after failed tx | Known wallet SDK 1.0.0 issue. Restart the CLI to release locked DUST coins |
| Wallet shows 0 balance after faucet | Wait for sync to complete. Confirm you used the correct **unshielded** address (`mn_addr_...`) |
| `Cannot find module './managed/lending/contract/index.js'` | Contract not compiled yet — run `cd contract && npm run compact` first |
| Tests fail with "Cannot find module" | Build the contract first: `cd contract && npm run compact && npm run build` |
| Node.js warnings about experimental features | Normal — `--loader ts-node/esm` triggers these; they don't affect functionality |

---

## Key Dependencies

| Package | Version | Purpose |
|---------|---------|---------|
| `@midnight-ntwrk/compact-runtime` | 0.14.0 | Compact contract runtime |
| `@midnight-ntwrk/midnight-js-contracts` | 3.0.0 | Contract deploy/call/join |
| `@midnight-ntwrk/wallet-sdk-facade` | 1.0.0 | Unified wallet interface |
| `@midnight-ntwrk/wallet-sdk-hd` | 3.0.0 | HD key derivation |
| `@midnight-ntwrk/ledger-v7` (via `@midnight-ntwrk/ledger`) | ^4.0.0 | Ledger types & primitives |
| `pino` | ^10.3.1 | Structured logging |
| `testcontainers` | ^11.12.0 | Docker management for standalone mode |

---

## Further Reading

- **[PROTOCOL.md](PROTOCOL.md)** — Complete protocol documentation: economic model, privacy design, circuit descriptions, ratio math, and liquidation mechanics
- **[MIGRATION_GUIDE.md](MIGRATION_GUIDE.md)** — Detailed guide for migrating from midnight-js 2.x to 3.0.0 (wallet SDK, docker images, contract patterns)
- [Preprod Faucet](https://faucet.preprod.midnight.network) — Get testnet tNight tokens
- [Midnight Documentation](https://docs.midnight.network/) — Developer guide
- [Compact Language Reference](https://docs.midnight.network/compact) — Smart contract language

---

## License

Licensed under the [Apache License 2.0](LICENSE).
