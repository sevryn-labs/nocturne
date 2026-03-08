// pUSD Lending Protocol — Interactive CLI
//
// Provides a menu-driven terminal interface for all five lending operations
// plus protocol state and user position views.
//
// Menus
// ─────
//  Wallet Setup    → create / restore / exit
//  Contract Setup  → deploy / join / monitor DUST / exit
//  Lending Actions → deposit / mint / repay / withdraw / liquidate / view / exit

import { type WalletContext } from './api.js';
import { stdin as input, stdout as output } from 'node:process';
import { createInterface, type Interface } from 'node:readline/promises';
import { type Logger } from 'pino';
import { type StartedDockerComposeEnvironment, type DockerComposeEnvironment } from 'testcontainers';
import { type LendingProviders, type DeployedLendingContract } from './common-types.js';
import { type Config, StandaloneConfig } from './config.js';
import * as api from './api.js';

let logger: Logger;

// Standalone genesis seed — pre-funded on local dev node only
const GENESIS_MINT_WALLET_SEED = '0000000000000000000000000000000000000000000000000000000000000001';

// ─── Display Constants ────────────────────────────────────────────────────────

const BANNER = `
╔══════════════════════════════════════════════════════════════════╗
║                                                                  ║
║    ██████╗ ██╗   ██╗███████╗██████╗                              ║
║    ██╔══██╗██║   ██║██╔════╝██╔══██╗                             ║
║    ██████╔╝██║   ██║███████╗██║  ██║                             ║
║    ██╔═══╝ ██║   ██║╚════██║██║  ██║                             ║
║    ██║     ╚██████╔╝███████║██████╔╝                             ║
║                                                                  ║
║    pUSD Privacy-Preserving Lending Protocol                      ║
║    ─────────────────────────────────────                         ║
║    Built on Midnight Network · Powered by ZK Proofs              ║
║                                                                  ║
╚══════════════════════════════════════════════════════════════════╝
`;

const DIVIDER = '──────────────────────────────────────────────────────────────────';

// ─── Menu Templates ───────────────────────────────────────────────────────────

const WALLET_MENU = `
${DIVIDER}
  Wallet Setup
${DIVIDER}
  [1] Create a new wallet (random seed)
  [2] Restore wallet from existing seed
  [3] Exit
${'─'.repeat(66)}
> `;

const contractMenu = (dustBalance: string) => `
${DIVIDER}
  Contract Setup${dustBalance ? `                        DUST: ${dustBalance}` : ''}
${DIVIDER}
  [1] Deploy a new pUSD Lending contract
  [2] Join an existing pUSD Lending contract
  [3] Monitor DUST balance
  [4] View Coin Public Key (for receiving pUSD)
  [5] Exit
${'─'.repeat(66)}
> `;

const lendingMenu = (dustBalance: string) => `
${DIVIDER}
  Lending Actions${dustBalance ? `                       DUST: ${dustBalance}` : ''}
${DIVIDER}
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
${'─'.repeat(66)}
> `;

// ─── Dust Helpers ─────────────────────────────────────────────────────────────

const getDustLabel = async (wallet: WalletContext['wallet']): Promise<string> => {
  try {
    const dust = await api.getDustBalance(wallet);
    return dust.available.toLocaleString();
  } catch {
    return '';
  }
};

const startDustMonitor = async (wallet: WalletContext['wallet'], rli: Interface): Promise<void> => {
  console.log('');
  const stopPromise = rli.question('  Press Enter to return to menu...\n').then(() => { });
  await api.monitorDustBalance(wallet, stopPromise);
  console.log('');
};

// ─── Amount Parsing ───────────────────────────────────────────────────────────

const promptAmount = async (rli: Interface, label: string): Promise<bigint | null> => {
  const raw = await rli.question(`  Enter ${label} (whole units): `);
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const n = BigInt(trimmed);
    if (n <= 0n) {
      console.log('  ✗ Amount must be positive\n');
      return null;
    }
    return n;
  } catch {
    console.log('  ✗ Invalid number\n');
    return null;
  }
};

// ─── Position Display ─────────────────────────────────────────────────────────

const displayPosition = async (providers: LendingProviders, contractAddress: string): Promise<void> => {
  console.log('');
  try {
    const pos = await api.getPosition(providers, contractAddress as any);
    console.log(`${DIVIDER}
  My Private Position
${DIVIDER}
  Collateral (tNight) : ${pos.collateralAmount.toLocaleString()}
  Debt (pUSD)         : ${pos.debtAmount.toLocaleString()}
  Collateral Ratio    : ${pos.debtAmount > 0n ? `${pos.collateralRatio}%` : 'N/A (no debt)'}
  Health              : ${pos.debtAmount === 0n
        ? '✓ No debt'
        : pos.isLiquidatable
          ? '⚠ LIQUIDATABLE (ratio < 150%)'
          : `✓ Healthy (ratio ≥ 150%)`
      }
${DIVIDER}`);
  } catch (e) {
    console.log(`  ✗ Could not read position: ${e instanceof Error ? e.message : String(e)}\n`);
  }
};

// ─── Wallet Balances Display ──────────────────────────────────────────────────

const displayWalletBalances = async (providers: LendingProviders, walletCtx: WalletContext, contractAddress: string): Promise<void> => {
  console.log('');
  try {
    const balances = await api.getWalletBalances(providers, walletCtx, contractAddress as any);
    console.log(`${DIVIDER}
  Wallet Balances
${DIVIDER}
  tNight (Unshielded) : ${balances.tNight.toLocaleString()}
  pUSD (Shielded API) : ${balances.pUSD.toLocaleString()}
${DIVIDER}`);
  } catch (e) {
    console.log(`  ✗ Could not read wallet balances: ${e instanceof Error ? e.message : String(e)}\n`);
  }
};

// ─── Protocol State Display ───────────────────────────────────────────────────

const displayProtocolState = async (providers: LendingProviders, contractAddress: string): Promise<void> => {
  console.log('');
  try {
    const state = await api.getProtocolState(providers, contractAddress as any);
    if (!state) {
      console.log('  ✗ Contract not found on chain\n');
      return;
    }
    console.log(`${DIVIDER}
  Public Protocol State
${DIVIDER}
  Total Collateral (tNight) : ${state.totalCollateral.toLocaleString()}
  Total pUSD Debt           : ${state.totalDebt.toLocaleString()}
  Liquidation Ratio         : ${state.liquidationRatio}%
  Minting Ratio             : ${state.mintingRatio}%
${DIVIDER}`);
  } catch (e) {
    console.log(`  ✗ Could not read protocol state: ${e instanceof Error ? e.message : String(e)}\n`);
  }
};

// ─── Error Display Helper ─────────────────────────────────────────────────────

const showError = (label: string, e: unknown): void => {
  const msg = e instanceof Error ? e.message : String(e);
  console.log(`\n  ✗ ${label} failed: ${msg}`);
  if (e instanceof Error && e.cause) {
    let cause: unknown = e.cause;
    let depth = 0;
    while (cause && depth < 5) {
      const causeMsg = cause instanceof Error
        ? `${cause.message}\n      ${cause.stack?.split('\n').slice(1, 3).join('\n      ') ?? ''}`
        : String(cause);
      console.log(`    cause: ${causeMsg}`);
      cause = cause instanceof Error ? cause.cause : undefined;
      depth++;
    }
  }
  if (msg.toLowerCase().includes('dust') || msg.toLowerCase().includes('no dust')) {
    console.log('    Insufficient DUST for fees — use option [3] to monitor your balance.');
  }
  console.log('');
};

// ─── Wallet Setup Flow ────────────────────────────────────────────────────────

const buildWallet = async (config: Config, rli: Interface): Promise<WalletContext | null> => {
  if (config instanceof StandaloneConfig) {
    return await api.buildWalletAndWaitForFunds(config, GENESIS_MINT_WALLET_SEED);
  }

  while (true) {
    const choice = await rli.question(WALLET_MENU);
    switch (choice.trim()) {
      case '1':
        return await api.buildFreshWallet(config);
      case '2': {
        const seed = await rli.question('Enter your wallet seed (hex): ');
        return await api.buildWalletAndWaitForFunds(config, seed.trim());
      }
      case '3':
        return null;
      default:
        console.log(`  Invalid choice: ${choice}\n`);
    }
  }
};

// ─── Contract Deploy / Join Flow ──────────────────────────────────────────────

const deployOrJoin = async (
  providers: LendingProviders,
  walletCtx: WalletContext,
  rli: Interface,
): Promise<DeployedLendingContract | null> => {
  while (true) {
    const dustLabel = await getDustLabel(walletCtx.wallet);
    const choice = await rli.question(contractMenu(dustLabel));

    switch (choice.trim()) {
      case '1':
        try {
          const contract = await api.withStatus('Deploying pUSD lending contract', () => api.deploy(providers));
          console.log(`  Contract deployed at: ${contract.deployTxData.public.contractAddress}\n`);
          return contract;
        } catch (e) {
          showError('Deploy', e);
        }
        break;

      case '2': {
        const address = await rli.question('Enter contract address (hex): ');
        try {
          const contract = await api.withStatus('Joining lending contract', () =>
            api.joinContract(providers, address.trim()),
          );
          console.log(`  Joined contract at: ${contract.deployTxData.public.contractAddress}\n`);
          return contract;
        } catch (e) {
          showError('Join', e);
        }
        break;
      }

      case '3':
        await startDustMonitor(walletCtx.wallet, rli);
        break;

      case '4': {
        try {
          const state = await api.waitForSync(walletCtx.wallet);
          const coinPubKey = state.shielded.coinPublicKey.toHexString();
          console.log(`\n${DIVIDER}\n  Coin Public Key (ZswapCoinPublicKey)\n${DIVIDER}\n  ${coinPubKey}\n${DIVIDER}`);
          console.log('  Share this key so others can transfer pUSD to you.\n');
        } catch (e) {
          console.log(`  ✗ Could not read coin public key: ${e instanceof Error ? e.message : String(e)}\n`);
        }
        break;
      }

      case '5':
        return null;

      default:
        console.log(`  Invalid choice: ${choice}\n`);
    }
  }
};

// ─── Main Lending Interaction Loop ────────────────────────────────────────────

const lendingLoop = async (
  providers: LendingProviders,
  walletCtx: WalletContext,
  lendingContract: DeployedLendingContract,
  rli: Interface,
): Promise<void> => {
  const contractAddress = lendingContract.deployTxData.public.contractAddress;

  while (true) {
    const dustLabel = await getDustLabel(walletCtx.wallet);
    const choice = await rli.question(lendingMenu(dustLabel));

    switch (choice.trim()) {
      // ── [1] Deposit Collateral ───────────────────────────────────────────
      case '1': {
        const amount = await promptAmount(rli, 'tNight to deposit as collateral');
        if (!amount) break;
        try {
          const tx = await api.withStatus(`Depositing ${amount.toLocaleString()} tNight`, () =>
            api.depositCollateral(lendingContract, providers, amount),
          );
          console.log(`  ✓ Deposited — tx ${tx.txId} in block ${tx.blockHeight}\n`);
          await displayPosition(providers, contractAddress);
        } catch (e) {
          showError('Deposit', e);
        }
        break;
      }

      // ── [2] Mint pUSD ────────────────────────────────────────────────────
      case '2': {
        // Show current position first to help user choose a safe mint amount
        await displayPosition(providers, contractAddress);
        const amount = await promptAmount(rli, 'pUSD to mint');
        if (!amount) break;
        try {
          const tx = await api.withStatus(`Minting ${amount.toLocaleString()} pUSD`, () =>
            api.mintPUSD(lendingContract, providers, amount),
          );
          console.log(`  ✓ Minted — tx ${tx.txId} in block ${tx.blockHeight}`);
          // Show updated pUSD balance for verification
          try {
            const balances = await api.getWalletBalances(providers, walletCtx, contractAddress as any);
            console.log(`  New pUSD balance: ${balances.pUSD.toLocaleString()}\n`);
          } catch {
            console.log('\n');
          }
          await displayPosition(providers, contractAddress);
        } catch (e) {
          showError('Mint', e);
        }
        break;
      }

      // ── [3] Repay pUSD ───────────────────────────────────────────────────
      case '3': {
        await displayPosition(providers, contractAddress);
        const amount = await promptAmount(rli, 'pUSD to repay');
        if (!amount) break;
        try {
          const tx = await api.withStatus(`Repaying ${amount.toLocaleString()} pUSD`, () =>
            api.repayPUSD(lendingContract, providers, amount),
          );
          console.log(`  ✓ Repaid — tx ${tx.txId} in block ${tx.blockHeight}\n`);
          await displayPosition(providers, contractAddress);
        } catch (e) {
          showError('Repay', e);
        }
        break;
      }

      // ── [4] Withdraw Collateral ──────────────────────────────────────────
      case '4': {
        await displayPosition(providers, contractAddress);
        const amount = await promptAmount(rli, 'tNight to withdraw');
        if (!amount) break;
        try {
          const tx = await api.withStatus(`Withdrawing ${amount.toLocaleString()} tNight`, () =>
            api.withdrawCollateral(lendingContract, providers, amount),
          );
          console.log(`  ✓ Withdrawn — tx ${tx.txId} in block ${tx.blockHeight}\n`);
          await displayPosition(providers, contractAddress);
        } catch (e) {
          showError('Withdraw', e);
        }
        break;
      }

      // ── [5] Liquidate ────────────────────────────────────────────────────
      case '5': {
        console.log(`
  Liquidation requires the victim's position values.
  You must know their collateral and debt amounts (e.g. from off-chain monitoring).
  The circuit will reject the call if the position is NOT undercollateralised.
`);
        const victimCollateral = await promptAmount(rli, "victim's collateral (tNight)");
        if (!victimCollateral) break;
        const victimDebt = await promptAmount(rli, "victim's debt (pUSD)");
        if (!victimDebt) break;

        const ratio = (victimCollateral * 100n) / victimDebt;
        if (ratio >= 150n) {
          console.log(`  ✗ Position ratio is ${ratio}% — NOT liquidatable (must be < 150%)\n`);
          break;
        }

        console.log(`  Position ratio: ${ratio}% — LIQUIDATABLE ✓`);
        const confirm = await rli.question('  Confirm liquidation? [y/N]: ');
        if (confirm.trim().toLowerCase() !== 'y') {
          console.log('  Cancelled.\n');
          break;
        }

        try {
          const tx = await api.withStatus('Liquidating position', () =>
            api.liquidate(lendingContract, victimCollateral, victimDebt),
          );
          console.log(`  ✓ Liquidated — tx ${tx.txId} in block ${tx.blockHeight}`);
          console.log(`  Received ${victimCollateral.toLocaleString()} tNight\n`);
          await displayProtocolState(providers, contractAddress);
        } catch (e) {
          showError('Liquidate', e);
        }
        break;
      }

      // ── [6] View Protocol State ──────────────────────────────────────────
      case '6':
        await displayProtocolState(providers, contractAddress);
        break;

      // ── [7] View My Position ─────────────────────────────────────────────
      case '7':
        await displayPosition(providers, contractAddress);
        break;

      // ── [8] View Wallet Balances ─────────────────────────────────────────
      case '8':
        await displayWalletBalances(providers, walletCtx, contractAddress);
        break;

      // ── [9] View Coin Public Key ─────────────────────────────────────────
      case '9': {
        try {
          const state = await api.waitForSync(walletCtx.wallet);
          const coinPubKey = state.shielded.coinPublicKey.toHexString();
          console.log(`\n${DIVIDER}\n  Coin Public Key (ZswapCoinPublicKey)\n${DIVIDER}\n  ${coinPubKey}\n${DIVIDER}`);
          console.log('  Share this key so others can transfer pUSD to you.\n');
        } catch (e) {
          console.log(`  ✗ Could not read coin public key: ${e instanceof Error ? e.message : String(e)}\n`);
        }
        break;
      }

      // ── [10] Transfer pUSD ───────────────────────────────────────────────
      case '10': {
        const toKey = await rli.question('  Enter recipient coin public key (hex): ');
        if (!toKey.trim()) break;

        const toPublicKeyHex = toKey.trim();

        const amount = await promptAmount(rli, 'pUSD to transfer');
        if (!amount) break;

        try {
          const tx = await api.withStatus(`Transferring ${amount.toLocaleString()} pUSD`, () =>
            api.transferPUSD(lendingContract, toPublicKeyHex, amount),
          );
          console.log(`  ✓ Transferred — tx ${tx.txId} in block ${tx.blockHeight}\n`);
          await displayWalletBalances(providers, walletCtx, contractAddress);
        } catch (e) {
          showError('Transfer', e);
        }
        break;
      }

      // ── [11] Exit ────────────────────────────────────────────────────────
      case '11':
        return;

      default:
        console.log(`  Invalid choice: ${choice}\n`);
    }
  }
};

// ─── Docker Port Mapping ──────────────────────────────────────────────────────

const mapContainerPort = (env: StartedDockerComposeEnvironment, url: string, containerName: string) => {
  const mappedUrl = new URL(url);
  const container = env.getContainer(containerName);
  mappedUrl.port = String(container.getFirstMappedPort());
  return mappedUrl.toString().replace(/\/+$/, '');
};

// ─── Entry Point ──────────────────────────────────────────────────────────────

/**
 * Main entry point.
 *
 * Flow:
 *   1. (Optional) Start Docker containers
 *   2. Build or restore wallet → wait for funds
 *   3. Configure midnight-js providers
 *   4. Deploy or join contract
 *   5. Enter lending interaction loop
 *   6. Clean up
 */
export const run = async (config: Config, _logger: Logger, dockerEnv?: DockerComposeEnvironment): Promise<void> => {
  logger = _logger;
  api.setLogger(_logger);

  console.log(BANNER);

  const rli = createInterface({ input, output, terminal: true });
  let env: StartedDockerComposeEnvironment | undefined;

  try {
    // Step 1: Optional Docker containers
    if (dockerEnv !== undefined) {
      env = await dockerEnv.up();

      if (config instanceof StandaloneConfig) {
        config.indexer = mapContainerPort(env, config.indexer, 'lending-indexer');
        config.indexerWS = mapContainerPort(env, config.indexerWS, 'lending-indexer');
        config.node = mapContainerPort(env, config.node, 'lending-node');
        config.proofServer = mapContainerPort(env, config.proofServer, 'lending-proof-server');
      }
    }

    // Step 2: Build wallet
    const walletCtx = await buildWallet(config, rli);
    if (walletCtx === null) return;

    try {
      // Step 3: Configure providers
      const providers = await api.withStatus('Configuring providers', () =>
        api.configureProviders(walletCtx, config),
      );
      console.log('');

      // Step 4: Deploy or join
      const lendingContract = await deployOrJoin(providers, walletCtx, rli);
      if (lendingContract === null) return;

      // Step 5: Lending loop
      await lendingLoop(providers, walletCtx, lendingContract, rli);
    } catch (e) {
      if (e instanceof Error) {
        logger.error(`Error: ${e.message}`);
        logger.debug(`${e.stack}`);
      } else {
        throw e;
      }
    } finally {
      try {
        await walletCtx.wallet.stop();
      } catch (e) {
        logger.error(`Error stopping wallet: ${e}`);
      }
    }
  } finally {
    rli.close();
    rli.removeAllListeners();

    if (env !== undefined) {
      try {
        await env.down();
      } catch (e) {
        logger.error(`Error shutting down docker environment: ${e}`);
      }
    }

    logger.info('Goodbye.');
  }
};
