# pUSD Lending Protocol

[![Generic badge](https://img.shields.io/badge/Compact%20Toolchain-0.28.0-1abc9c.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/midnight--js-3.0.0-blueviolet.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/wallet--sdk--facade-1.0.0-blue.svg)](https://shields.io/) [![Generic badge](https://img.shields.io/badge/Tests-48%20passing-brightgreen.svg)](https://shields.io/)

A **privacy-preserving collateralised lending protocol** built on the [Midnight Network](https://midnight.network). Deposit tNight as collateral, mint pUSD synthetic stablecoins, and maintain positions privately via zero-knowledge proofs — individual debt and collateral amounts are never exposed on-chain.

> Conceptually equivalent to MakerDAO, built for Midnight's ZK-first architecture.

---

## Recent Updates (v2)
- ✅ **pUSD Transfers:** Full peer-to-peer synthetic token transfers using the recipient's Coin Public Key.
- ✅ **Multi-Wallet Support:** Run multiple wallets concurrently on the same machine without LevelDB encryption conflicts.
- ✅ **Token Balances:** On-chain pUSD and shielded wallet token balance fetching.
- ✅ **Session Recovery:** Better API resilience for frontend connection recovery.

---

## Table of Contents

- [How It Works](#how-it-works)
- [Architecture](#architecture)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Quick Start — Web UI](#quick-start--web-ui)
- [Quick Start — CLI](#quick-start--cli)
- [Web Frontend Features](#web-frontend-features)
- [API Endpoints](#api-endpoints)
- [Using the CLI](#using-the-lending-protocol-cli)
- [Running Tests](#running-tests)
- [Standalone Mode](#standalone-mode-fully-local)
- [Network Targets](#network-targets)
- [Environment Variables](#environment-variables)
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
| `totalDebt` | 🌐 Public | Verify no unbacked pUSD (`totalSupply == totalDebt`) |
| `totalSupply` | 🌐 Public | The aggregate supply of the fungible pUSD token |
| `liquidationRatio` / `mintingRatio` | 🌐 Public | Transparent risk parameter |
| **Your collateral** | 🔒 Private | Hidden in ZK — never on-chain |
| **Your debt** | 🔒 Private | Hidden in ZK — never on-chain |
| **pUSD Balances** | 🌐 Public | ERC20-style transparent balances on-chain |
| **Your identity** | 🔒 Private | Pseudonymous (Midnight public key only) |

Private state lives in a user-controlled local LevelDB database and is supplied to ZK circuits via **witness** functions. The Compact runtime generates a zero-knowledge proof that constraints hold without revealing actual values.

---

## Architecture

The protocol supports two interaction modes — a **React Web UI** and a **terminal CLI** — both backed by the same contract and wallet SDK:

```
┌──────────────────────┐    ┌─────────────────────────────────────┐
│  React Web UI        │    │           CLI (cli.ts)               │
│  (lending-ui)        │    │  Menu-driven terminal interface      │
│  localhost:5173      │    └──────────────────┬──────────────────┘
└──────────┬───────────┘                       │
           │ HTTP/JSON                         │ direct import
┌──────────▼───────────┐                       │
│  REST API Server     │                       │
│  (lending-api)       ├───────────────────────┤
│  localhost:3001      │                       │
│  Express + LendingService                    │
└──────────┬───────────┘                       │
           │                                   │
┌──────────▼───────────────────────────────────▼──────────────────┐
│                      TypeScript API (api.ts / lending-service)   │
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
│       └── lending.test.ts                # 48 unit tests (vitest)
│
├── lending-api/                           # REST API server (NEW)
│   ├── package.json                       # @midnight-ntwrk/lending-api
│   └── src/
│       ├── server.ts                      # Express server (port 3001)
│       ├── lending-service.ts             # Core service: wallet, contract, operations
│       ├── config.ts                      # Network configs (mirrors lending-cli)
│       └── common-types.ts                # Shared types
│
├── lending-ui/                            # React web frontend (NEW)
│   ├── package.json                       # @midnight-ntwrk/lending-ui
│   ├── index.html                         # Entry HTML
│   ├── vite.config.ts                     # Vite + API proxy config
│   └── src/
│       ├── main.tsx                       # React entry point
│       ├── App.tsx                        # Root component + routing
│       ├── api.ts                         # Typed HTTP client for lending-api
│       ├── context.tsx                    # React Context for global state
│       ├── index.css                      # Design system (dark theme, glassmorphism)
│       └── pages/
│           ├── Setup.tsx                  # Wallet init + contract deploy/join
│           ├── Dashboard.tsx              # Public protocol state
│           ├── Position.tsx               # Private position + health indicator
│           └── Actions.tsx                # Deposit/Mint/Repay/Withdraw/Liquidate
│
├── lending-cli/                           # CLI & API layer (original)
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

## Quick Start — Web UI

The recommended way to interact with the lending protocol is via the **React Web UI**.

### 1. Install dependencies

```bash
npm install
```

### 2. Build the smart contract

```bash
cd contract
npm run compact    # compile Compact → ZK circuits + TypeScript bindings
npm run build      # tsc compile
npm run test       # run 48 unit tests (no network required)
```

Expected output from `npm run compact`:

```
  circuit "allowance"         (k=10, rows=634)
  circuit "approve"           (k=10, rows=711)
  circuit "balanceOf"         (k=9, rows=344)
  circuit "decimals"          (k=6, rows=26)
  circuit "depositCollateral" (k=9, rows=201)
  circuit "liquidate"         (k=10, rows=724)
  circuit "mintPUSD"          (k=10, rows=909)
  circuit "repayPUSD"         (k=10, rows=634)
  circuit "totalSupply"       (k=6, rows=26)
  circuit "transfer"          (k=10, rows=1013)
  circuit "transferFrom"      (k=11, rows=1482)
  circuit "withdrawCollateral"(k=9, rows=354)
```

> The first run downloads zero-knowledge parameters (~500 MB). This is a one-time download cached at `~/.compact/`.

### 3. Start the Proof Server

```bash
cd lending-cli && docker compose -f proof-server.yml up -d
```

Wait until it shows `listening on 0.0.0.0:6300` in the logs.

### 4. Start the API Server

```bash
# From the project root
npm run dev:api
```

The REST API server starts on **http://localhost:3001**. You should see:

```
[lending-api] Network: preprod | Port: 3001
[lending-api] Server running at http://localhost:3001
```

### 5. Start the Web Frontend

In a second terminal:

```bash
# From the project root
npm run dev:ui
```

Open **http://localhost:5173** in your browser. The Vite dev server proxies API requests to the backend automatically.

### 6. Use the Protocol

1. **Setup page** → Click "Create New Wallet" (or restore from seed)
2. Fund your wallet with tNight from the [Preprod Faucet](https://faucet.preprod.midnight.network)
3. **Setup page** → Click "Deploy New Contract" (or join an existing one)
4. **Dashboard** → View public protocol state
5. **My Position** → View your private collateral and debt
6. **Actions** → Deposit, Mint, Repay, Withdraw, or Liquidate

> ⏱ Wallet initialization takes 30–60 seconds (sync + DUST registration). Contract deployment takes 1–3 minutes (ZK proof generation).

---

## Quick Start — CLI

The original terminal CLI is still fully functional.

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
  [4] View Coin Public Key (for receiving pUSD)
  [5] Exit
```

- **[1] Deploy** — creates a new lending protocol on-chain. Save the contract address shown on success.
- **[2] Join** — enter a contract address to interact with an existing deployment.
- **[3] Monitor** — live-stream your DUST balance (useful while waiting for generation).
- **[4] View Coin Public Key** — display your ZSwap shielded public key.

> **Tip:** You can run multiple CLI tabs with different seeds to simulate multi-user behavior. The LevelDB state is isolated per wallet, preventing any cross-wallet AES encryption conflicts.

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
  [8] View Wallet Balances (tNight & pUSD)
  [9] View Coin Public Key (for receiving pUSD)
  [10] Transfer pUSD       (send tokens to another coin public key)
  [11] Exit
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

## Web Frontend Features

The React UI (`lending-ui/`) provides four pages:

| Page | Route | Description |
|------|-------|-------------|
| **Setup** | `/setup` | Wallet initialization (new or restore), contract deploy/join |
| **Dashboard** | `/dashboard` | Public protocol state: total collateral, total debt, ratios, utilization |
| **My Position** | `/position` | Private state with health indicator (Green ≥170% / Yellow 150–170% / Red <150%) |
| **Actions** | `/actions` | Tabbed forms for Deposit, Mint, Repay, Withdraw, Liquidate |

### UX Highlights

- **Live Ratio Preview** — When typing amounts in mint/withdraw/deposit/repay forms, the new collateral ratio is calculated and displayed instantly with color-coded health warnings
- **Health Indicator** — Color-coded badge (🛡 Healthy / ⚠️ At Risk / 🚨 Critical) with animated ratio bar and liquidation threshold markers
- **ZK Proof Feedback** — Loading states with estimated timing for proof generation
- **Error Classification** — Errors are categorized (`WALLET_NOT_INITIALIZED`, `INSUFFICIENT_BALANCE`, `PROOF_SERVER_DOWN`, etc.) and displayed with user-friendly messages
- **Auto-Refresh** — Protocol state refreshes every 30 seconds; position refreshes after every action
- **Premium Dark Theme** — Glassmorphism, gradient accents, Inter + JetBrains Mono typography, micro-animations

---

## API Endpoints

The REST API server (`lending-api/`) exposes the following endpoints on **http://localhost:3001**:

### Wallet

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/wallet/initialize` | `{ seed?: string }` | Create or restore wallet |
| `GET` | `/api/wallet/info` | — | Get wallet balances and addresses |
| `POST` | `/api/wallet/wait-for-funds` | — | Block until tNight balance > 0 |
| `POST` | `/api/wallet/register-dust` | — | Register for DUST generation |
| `GET` | `/api/wallet/dust` | — | Get DUST balance |

### Contract

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/contract/deploy` | — | Deploy a new lending contract |
| `POST` | `/api/contract/join` | `{ address: string }` | Join existing contract |

### State

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/protocol/state` | Public protocol state (totals, ratios) |
| `GET` | `/api/position` | Private position (collateral, debt, ratio) |
| `GET` | `/api/health` | Server health + connection status |

### Lending Actions

| Method | Endpoint | Body | Description |
|--------|----------|------|-------------|
| `POST` | `/api/actions/deposit` | `{ amount: string }` | Deposit tNight collateral |
| `POST` | `/api/actions/mint` | `{ amount: string }` | Mint pUSD |
| `POST` | `/api/actions/repay` | `{ amount: string }` | Repay pUSD debt |
| `POST` | `/api/actions/withdraw` | `{ amount: string }` | Withdraw tNight |
| `POST` | `/api/actions/liquidate` | `{ victimCollateral, victimDebt }` | Liquidate undercollateralised position |
| `POST` | `/api/actions/transfer` | `{ recipientPublicKey, amount }` | Transfer pUSD to another wallet |

All responses use JSON. BigInt values are serialized as strings. Errors include an `errorType` field for frontend categorization.

---

## Running Tests

```bash
cd contract
npm test
```

```
 ✓ src/test/lending.test.ts (48 tests) 1018ms
   ✓ 1. Contract Initialization (3)
   ✓ 2. Collateral Management (depositCollateral) (5)
   ✓ 3. Minting Tests (mintPUSD) (5)
   ✓ 4. Repayment Tests (repayPUSD) (5)
   ✓ 5. Withdraw Collateral Tests (withdrawCollateral) (5)
   ✓ 6. Liquidation Tests (liquidate) (4)
   ✓ 7. Token Transfer Tests (transfer) (6)
   ✓ 8. Allowance + Approval Tests (approve) (4)
   ✓ 9. transferFrom Tests (transferFrom) (5)
   ✓ 10. Multi-user System Tests (1)
   ✓ 11. Protocol Invariant Tests (1)
   ✓ 12. Sequential Workflow Tests (2)
   ✓ 13. Boundary Tests (1)
   ✓ 14. Randomized / Fuzz Tests (1)

 Tests  48 passed (48)
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

## Environment Variables

| Variable | Default | Used By | Description |
|----------|---------|---------|-------------|
| `MIDNIGHT_NETWORK` | `preprod` | `lending-api` | Network to connect to: `standalone`, `preview`, or `preprod` |
| `PORT` | `3001` | `lending-api` | HTTP port for the REST API server |

Example:

```bash
MIDNIGHT_NETWORK=standalone PORT=4000 npm run dev:api
```

### Root Workspace Scripts

| Script | Description |
|--------|-------------|
| `npm run dev:api` | Start the REST API server (port 3001) |
| `npm run dev:ui` | Start the React dev server (port 5173) |
| `npm run dev:cli` | Start the CLI in standalone mode |

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
| `express` | ^5.1.0 | REST API framework (lending-api) |
| `react` | ^19.0.0 | UI framework (lending-ui) |
| `react-router-dom` | ^7.1.0 | Client-side routing |
| `vite` | ^6.0.0 | Frontend build tool |
| `tsx` | ^4.21.0 | TypeScript execution (Node v24 compatible) |
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
