// pUSD Lending Protocol — TypeScript API Layer
//
// This module provides the high-level TypeScript API that wraps the
// Compact-generated lending contract.  It handles:
//   • Wallet construction (HD key derivation → ShieldedWallet + UnshieldedWallet + DustWallet)
//   • Provider setup (ZK config, proof server, indexer, private state storage)
//   • Contract deployment and joining
//   • All five lending operations: deposit, mint, repay, withdraw, liquidate
//   • Private state management (reading/updating the local LevelDB state)
//
// The wallet-sdk workaround for the signRecipe / pre-proof bug is carried over
// unchanged from the example-counter app (see agent.md for details).

/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */

import { type ContractAddress } from '@midnight-ntwrk/compact-runtime';
import {
  Lending,
  type LendingPrivateState,
  witnesses,
  initialLendingPrivateState,
} from '@midnight-ntwrk/lending-contract';
import * as ledger from '@midnight-ntwrk/ledger-v7';
import { unshieldedToken } from '@midnight-ntwrk/ledger-v7';
import { deployContract, findDeployedContract } from '@midnight-ntwrk/midnight-js-contracts';
import { httpClientProofProvider } from '@midnight-ntwrk/midnight-js-http-client-proof-provider';
import { indexerPublicDataProvider } from '@midnight-ntwrk/midnight-js-indexer-public-data-provider';
import { NodeZkConfigProvider } from '@midnight-ntwrk/midnight-js-node-zk-config-provider';
import { type FinalizedTxData, type MidnightProvider, type WalletProvider } from '@midnight-ntwrk/midnight-js-types';
import { WalletFacade } from '@midnight-ntwrk/wallet-sdk-facade';
import { DustWallet } from '@midnight-ntwrk/wallet-sdk-dust-wallet';
import { HDWallet, Roles, generateRandomSeed } from '@midnight-ntwrk/wallet-sdk-hd';
import { ShieldedWallet } from '@midnight-ntwrk/wallet-sdk-shielded';
import {
  createKeystore,
  InMemoryTransactionHistoryStorage,
  PublicKey,
  UnshieldedWallet,
  type UnshieldedKeystore,
} from '@midnight-ntwrk/wallet-sdk-unshielded-wallet';
import { type Logger } from 'pino';
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import {
  type LendingCircuits,
  type LendingContract,
  type LendingProviders,
  LendingPrivateStateId,
  type DeployedLendingContract,
  type ProtocolState,
  type UserPosition,
} from './common-types.js';
import { type Config, contractConfig } from './config.js';
import { levelPrivateStateProvider } from '@midnight-ntwrk/midnight-js-level-private-state-provider';
import { assertIsContractAddress, toHex } from '@midnight-ntwrk/midnight-js-utils';
import { getNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
import { CompiledContract } from '@midnight-ntwrk/compact-js';
import { Buffer } from 'buffer';
import {
  MidnightBech32m,
  ShieldedAddress,
  ShieldedCoinPublicKey,
  ShieldedEncryptionPublicKey,
} from '@midnight-ntwrk/wallet-sdk-address-format';

let logger: Logger;

// Required for GraphQL subscriptions (wallet sync) to work in Node.js
// @ts-expect-error: It's needed to enable WebSocket usage through apollo
globalThis.WebSocket = WebSocket;

// ─── Compiled Contract ───────────────────────────────────────────────────────

/**
 * Pre-compiled lending contract with ZK circuit assets loaded from the
 * managed/ directory produced by `npm run compact`.
 */
const lendingCompiledContract = CompiledContract.make('lending', Lending.Contract).pipe(
  CompiledContract.withVacantWitnesses,
  CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
);

// ─── Wallet Context ──────────────────────────────────────────────────────────

export interface WalletContext {
  wallet: WalletFacade;
  shieldedSecretKeys: ledger.ZswapSecretKeys;
  dustSecretKey: ledger.DustSecretKey;
  unshieldedKeystore: UnshieldedKeystore;
}

// ─── Public-State Queries ────────────────────────────────────────────────────

/**
 * Read the lending protocol's public ledger state from the indexer.
 * Returns aggregate totals and ratio parameters — no private data.
 */
export const getProtocolState = async (
  providers: LendingProviders,
  contractAddress: ContractAddress,
): Promise<ProtocolState | null> => {
  assertIsContractAddress(contractAddress);
  logger.info('Querying public protocol state...');

  const contractState = await providers.publicDataProvider.queryContractState(contractAddress);
  if (contractState == null) {
    logger.warn(`No contract found at ${contractAddress}`);
    return null;
  }

  const lstate = Lending.ledger(contractState.data);
  const state: ProtocolState = {
    totalCollateral: lstate.totalCollateral,
    totalDebt: lstate.totalDebt,
    liquidationRatio: lstate.liquidationRatio,
    mintingRatio: lstate.mintingRatio,
  };

  logger.info(
    `Protocol state: totalCollateral=${state.totalCollateral}, ` +
    `totalDebt=${state.totalDebt}, ` +
    `liquidationRatio=${state.liquidationRatio}%, ` +
    `mintingRatio=${state.mintingRatio}%`,
  );
  return state;
};

/**
 * Read the calling user's PRIVATE position from the local LevelDB store.
 * This does NOT go to the network — it reads locally stored private state.
 */
export const getPosition = async (
  providers: LendingProviders,
  contractAddress: ContractAddress,
): Promise<UserPosition> => {
  const ps = await providers.privateStateProvider.get(LendingPrivateStateId);
  const state: LendingPrivateState = ps ?? initialLendingPrivateState;

  const { collateralAmount, debtAmount } = state;

  let collateralRatio = 0n;
  let isLiquidatable = false;

  if (debtAmount > 0n) {
    collateralRatio = (collateralAmount * 100n) / debtAmount;
    // We also need the liquidation ratio to evaluate liquidatability.
    // For now check against the well-known default of 150%.
    // In production, read this from the public state.
    isLiquidatable = collateralRatio < 150n;
  }

  return { collateralAmount, debtAmount, collateralRatio, isLiquidatable };
};

// ─── Contract Instance & Deploy/Join ─────────────────────────────────────────

/** Singleton lending contract instance (no witnesses needed at this level). */
export const lendingContractInstance: LendingContract = new Lending.Contract(witnesses);

/**
 * Join an already-deployed lending contract by address.
 * Connects the local proof/indexer providers to the existing contract.
 */
export const joinContract = async (
  providers: LendingProviders,
  contractAddress: string,
): Promise<DeployedLendingContract> => {
  const contract = await findDeployedContract(providers, {
    contractAddress,
    compiledContract: lendingCompiledContract,
    privateStateId: LendingPrivateStateId,
    initialPrivateState: initialLendingPrivateState,
  });
  logger.info(`Joined lending contract at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

/**
 * Deploy a fresh lending contract to the network.
 * The constructor initialises liquidationRatio=150 and mintingRatio=150.
 */
export const deploy = async (providers: LendingProviders): Promise<DeployedLendingContract> => {
  logger.info('Deploying lending contract...');
  const contract = await deployContract(providers, {
    compiledContract: lendingCompiledContract,
    privateStateId: LendingPrivateStateId,
    initialPrivateState: initialLendingPrivateState,
  });
  logger.info(`Deployed lending contract at: ${contract.deployTxData.public.contractAddress}`);
  return contract;
};

// ─── Lending Operations ───────────────────────────────────────────────────────
//
// Each operation:
//   1. Validates user inputs locally.
//   2. Updates the local private state BEFORE calling the circuit so the
//      witness functions return the correct values.
//   3. Calls the circuit (which generates a ZK proof and submits the tx).
//   4. Returns finalized tx data (confirmed block height, tx ID).
//
// NOTE ON PRIVATE STATE UPDATES
// ─────────────────────────────
// In Midnight V0.2.x the contract runtime does NOT automatically persist
// updated private state after a circuit call. The application layer is
// responsible for updating `privateStateProvider` to reflect state changes.
// We do this by reading, modifying, and re-writing the LevelDB entry.

const updatePrivateState = async (
  providers: LendingProviders,
  updater: (current: LendingPrivateState) => LendingPrivateState,
): Promise<void> => {
  const current =
    (await providers.privateStateProvider.get(LendingPrivateStateId)) ?? initialLendingPrivateState;
  const next = updater(current);
  await providers.privateStateProvider.set(LendingPrivateStateId, next);
};

// ─── depositCollateral ───────────────────────────────────────────────────────

/**
 * Deposit `amount` tNight as collateral.
 *
 * Flow:
 *   1. Update local private state so witnesses return the current values.
 *   2. Call `depositCollateral(amount)` on the contract (proves + submits tx).
 *   3. After confirmation, update private state to reflect the new deposit.
 */
export const depositCollateral = async (
  contract: DeployedLendingContract,
  providers: LendingProviders,
  amount: bigint,
): Promise<FinalizedTxData> => {
  if (amount <= 0n) throw new Error('Deposit amount must be positive');

  logger.info(`Depositing ${amount} tNight as collateral...`);

  const txData = await contract.callTx.depositCollateral(amount);

  // Update private state: increment collateral
  await updatePrivateState(providers, (s) => ({
    ...s,
    collateralAmount: s.collateralAmount + amount,
  }));

  logger.info(`depositCollateral confirmed in block ${txData.public.blockHeight}`);
  return txData.public;
};

// ─── mintPUSD ────────────────────────────────────────────────────────────────

/**
 * Mint `amount` pUSD against the current collateral position.
 * The circuit enforces collateral ratio ≥ 150%.
 */
export const mintPUSD = async (
  contract: DeployedLendingContract,
  providers: LendingProviders,
  amount: bigint,
): Promise<FinalizedTxData> => {
  if (amount <= 0n) throw new Error('Mint amount must be positive');

  logger.info(`Minting ${amount} pUSD...`);

  const txData = await contract.callTx.mintPUSD(amount);

  // Update private state: increment debt
  await updatePrivateState(providers, (s) => ({
    ...s,
    debtAmount: s.debtAmount + amount,
  }));

  logger.info(`mintPUSD confirmed in block ${txData.public.blockHeight}`);
  return txData.public;
};

// ─── repayPUSD ───────────────────────────────────────────────────────────────

/**
 * Repay `amount` pUSD, reducing the position's debt.
 */
export const repayPUSD = async (
  contract: DeployedLendingContract,
  providers: LendingProviders,
  amount: bigint,
): Promise<FinalizedTxData> => {
  if (amount <= 0n) throw new Error('Repay amount must be positive');

  const ps = (await providers.privateStateProvider.get(LendingPrivateStateId)) ?? initialLendingPrivateState;
  if (ps.debtAmount < amount) {
    throw new Error(`Cannot repay ${amount} — current debt is only ${ps.debtAmount}`);
  }

  logger.info(`Repaying ${amount} pUSD...`);

  const txData = await contract.callTx.repayPUSD(amount);

  // Update private state: decrement debt
  await updatePrivateState(providers, (s) => ({
    ...s,
    debtAmount: s.debtAmount - amount,
  }));

  logger.info(`repayPUSD confirmed in block ${txData.public.blockHeight}`);
  return txData.public;
};

// ─── withdrawCollateral ──────────────────────────────────────────────────────

/**
 * Withdraw `amount` tNight from the collateral position.
 * The circuit enforces the remaining ratio stays ≥ liquidation ratio.
 */
export const withdrawCollateral = async (
  contract: DeployedLendingContract,
  providers: LendingProviders,
  amount: bigint,
): Promise<FinalizedTxData> => {
  if (amount <= 0n) throw new Error('Withdrawal amount must be positive');

  const ps = (await providers.privateStateProvider.get(LendingPrivateStateId)) ?? initialLendingPrivateState;
  if (ps.collateralAmount < amount) {
    throw new Error(`Cannot withdraw ${amount} — only ${ps.collateralAmount} deposited`);
  }

  logger.info(`Withdrawing ${amount} tNight...`);

  const txData = await contract.callTx.withdrawCollateral(amount);

  // Update private state: decrement collateral
  await updatePrivateState(providers, (s) => ({
    ...s,
    collateralAmount: s.collateralAmount - amount,
  }));

  logger.info(`withdrawCollateral confirmed in block ${txData.public.blockHeight}`);
  return txData.public;
};

// ─── liquidate ───────────────────────────────────────────────────────────────

/**
 * Liquidate an undercollateralised position identified by the victim's
 * collateral and debt amounts that the liquidator can prove (e.g. from
 * off-chain observation or keepers).
 *
 * On success the liquidator receives the victim's collateral.
 */
export const liquidate = async (
  contract: DeployedLendingContract,
  victimCollateral: bigint,
  victimDebt: bigint,
): Promise<FinalizedTxData> => {
  if (victimDebt <= 0n) throw new Error('victimDebt must be positive');
  if (victimCollateral <= 0n) throw new Error('victimCollateral must be positive');

  const ratio = (victimCollateral * 100n) / victimDebt;
  if (ratio >= 150n) {
    throw new Error(`Position ratio is ${ratio}% — not liquidatable (must be < 150%)`);
  }

  logger.info(`Liquidating position: collateral=${victimCollateral}, debt=${victimDebt}, ratio=${ratio}%`);

  const txData = await contract.callTx.liquidate(victimCollateral, victimDebt);

  logger.info(`liquidate confirmed in block ${txData.public.blockHeight}`);
  return txData.public;
};

// ─── Wallet Infrastructure ───────────────────────────────────────────────────
// Carried over from example-counter; see agent.md for the signRecipe bug
// workaround explanation.

/**
 * Sign all unshielded offers in a transaction's intents, using the correct
 * proof marker for Intent.deserialize.
 */
const signTransactionIntents = (
  tx: { intents?: Map<number, any> },
  signFn: (payload: Uint8Array) => ledger.Signature,
  proofMarker: 'proof' | 'pre-proof',
): void => {
  if (!tx.intents || tx.intents.size === 0) return;

  for (const segment of tx.intents.keys()) {
    const intent = tx.intents.get(segment);
    if (!intent) continue;

    const cloned = ledger.Intent.deserialize<ledger.SignatureEnabled, ledger.Proofish, ledger.PreBinding>(
      'signature',
      proofMarker,
      'pre-binding',
      intent.serialize(),
    );

    const sigData = cloned.signatureData(segment);
    const signature = signFn(sigData);

    if (cloned.fallibleUnshieldedOffer) {
      const sigs = cloned.fallibleUnshieldedOffer.inputs.map(
        (_: ledger.UtxoSpend, i: number) => cloned.fallibleUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.fallibleUnshieldedOffer = cloned.fallibleUnshieldedOffer.addSignatures(sigs);
    }

    if (cloned.guaranteedUnshieldedOffer) {
      const sigs = cloned.guaranteedUnshieldedOffer.inputs.map(
        (_: ledger.UtxoSpend, i: number) => cloned.guaranteedUnshieldedOffer!.signatures.at(i) ?? signature,
      );
      cloned.guaranteedUnshieldedOffer = cloned.guaranteedUnshieldedOffer.addSignatures(sigs);
    }

    tx.intents.set(segment, cloned);
  }
};

export const createWalletAndMidnightProvider = async (
  ctx: WalletContext,
): Promise<WalletProvider & MidnightProvider> => {
  const state = await Rx.firstValueFrom(ctx.wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  return {
    getCoinPublicKey() {
      return state.shielded.coinPublicKey.toHexString();
    },
    getEncryptionPublicKey() {
      return state.shielded.encryptionPublicKey.toHexString();
    },
    async balanceTx(tx, ttl?) {
      const recipe = await ctx.wallet.balanceUnboundTransaction(
        tx,
        { shieldedSecretKeys: ctx.shieldedSecretKeys, dustSecretKey: ctx.dustSecretKey },
        { ttl: ttl ?? new Date(Date.now() + 30 * 60 * 1000) },
      );
      const signFn = (payload: Uint8Array) => ctx.unshieldedKeystore.signData(payload);
      signTransactionIntents(recipe.baseTransaction, signFn, 'proof');
      if (recipe.balancingTransaction) {
        signTransactionIntents(recipe.balancingTransaction, signFn, 'pre-proof');
      }
      return ctx.wallet.finalizeRecipe(recipe);
    },
    submitTx(tx) {
      return ctx.wallet.submitTransaction(tx) as any;
    },
  };
};

export const waitForSync = (wallet: WalletFacade) =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(5_000),
      Rx.filter((state) => state.isSynced),
    ),
  );

export const waitForFunds = (wallet: WalletFacade): Promise<bigint> =>
  Rx.firstValueFrom(
    wallet.state().pipe(
      Rx.throttleTime(10_000),
      Rx.filter((state) => state.isSynced),
      Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
      Rx.filter((balance) => balance > 0n),
    ),
  );

const buildShieldedConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: indexer, indexerWsUrl: indexerWS },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});

const buildUnshieldedConfig = ({ indexer, indexerWS }: Config) => ({
  networkId: getNetworkId(),
  indexerClientConnection: { indexerHttpUrl: indexer, indexerWsUrl: indexerWS },
  txHistoryStorage: new InMemoryTransactionHistoryStorage(),
});

const buildDustConfig = ({ indexer, indexerWS, node, proofServer }: Config) => ({
  networkId: getNetworkId(),
  costParameters: {
    additionalFeeOverhead: 300_000_000_000_000n,
    feeBlocksMargin: 5,
  },
  indexerClientConnection: { indexerHttpUrl: indexer, indexerWsUrl: indexerWS },
  provingServerUrl: new URL(proofServer),
  relayURL: new URL(node.replace(/^http/, 'ws')),
});

const deriveKeysFromSeed = (seed: string) => {
  const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
  if (hdWallet.type !== 'seedOk') throw new Error('Failed to initialize HDWallet from seed');

  const derivationResult = hdWallet.hdWallet
    .selectAccount(0)
    .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
    .deriveKeysAt(0);

  if (derivationResult.type !== 'keysDerived') throw new Error('Failed to derive keys');
  hdWallet.hdWallet.clear();
  return derivationResult.keys;
};

// ─── Spinner Helper ───────────────────────────────────────────────────────────

export const withStatus = async <T>(message: string, fn: () => Promise<T>): Promise<T> => {
  const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
  let i = 0;
  const interval = setInterval(() => {
    process.stdout.write(`\r  ${frames[i++ % frames.length]} ${message}`);
  }, 80);
  try {
    const result = await fn();
    clearInterval(interval);
    process.stdout.write(`\r  ✓ ${message}\n`);
    return result;
  } catch (e) {
    clearInterval(interval);
    process.stdout.write(`\r  ✗ ${message}\n`);
    throw e;
  }
};

const formatBalance = (balance: bigint): string => balance.toLocaleString();

// ─── Dust Registration ───────────────────────────────────────────────────────

const registerForDustGeneration = async (
  wallet: WalletFacade,
  unshieldedKeystore: UnshieldedKeystore,
): Promise<void> => {
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));

  if (state.dust.availableCoins.length > 0) {
    const dustBal = state.dust.walletBalance(new Date());
    console.log(`  ✓ Dust tokens already available (${formatBalance(dustBal)} DUST)`);
    return;
  }

  const nightUtxos = state.unshielded.availableCoins.filter(
    (coin: any) => coin.meta?.registeredForDustGeneration !== true,
  );

  if (nightUtxos.length === 0) {
    await withStatus('Waiting for dust tokens to generate', () =>
      Rx.firstValueFrom(
        wallet.state().pipe(
          Rx.throttleTime(5_000),
          Rx.filter((s) => s.isSynced),
          Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
        ),
      ),
    );
    return;
  }

  await withStatus(`Registering ${nightUtxos.length} NIGHT UTXO(s) for dust generation`, async () => {
    const recipe = await wallet.registerNightUtxosForDustGeneration(
      nightUtxos,
      unshieldedKeystore.getPublicKey(),
      (payload) => unshieldedKeystore.signData(payload),
    );
    const finalized = await wallet.finalizeRecipe(recipe);
    await wallet.submitTransaction(finalized);
  });

  await withStatus('Waiting for dust tokens to generate', () =>
    Rx.firstValueFrom(
      wallet.state().pipe(
        Rx.throttleTime(5_000),
        Rx.filter((s) => s.isSynced),
        Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
      ),
    ),
  );
};

// ─── Wallet Summary ───────────────────────────────────────────────────────────

const printWalletSummary = (seed: string, state: any, unshieldedKeystore: UnshieldedKeystore) => {
  const networkId = getNetworkId();
  const unshieldedBalance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;

  const coinPubKey = ShieldedCoinPublicKey.fromHexString(state.shielded.coinPublicKey.toHexString());
  const encPubKey = ShieldedEncryptionPublicKey.fromHexString(state.shielded.encryptionPublicKey.toHexString());
  const shieldedAddress = MidnightBech32m.encode(networkId, new ShieldedAddress(coinPubKey, encPubKey)).toString();

  const DIV = '──────────────────────────────────────────────────────────────';
  console.log(`
${DIV}
  Wallet Overview                            Network: ${networkId}
${DIV}
  Seed: ${seed}
${DIV}

  Shielded (ZSwap)
  └─ Address: ${shieldedAddress}

  Unshielded
  ├─ Address: ${unshieldedKeystore.getBech32Address()}
  └─ Balance: ${formatBalance(unshieldedBalance)} tNight

  Dust
  └─ Address: ${state.dust.dustAddress}

${DIV}`);
};

// ─── Build Wallet ─────────────────────────────────────────────────────────────

export const buildWalletAndWaitForFunds = async (config: Config, seed: string): Promise<WalletContext> => {
  console.log('');

  const { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore } = await withStatus(
    'Building wallet',
    async () => {
      const keys = deriveKeysFromSeed(seed);
      const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
      const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
      const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

      const shieldedWallet = ShieldedWallet(buildShieldedConfig(config)).startWithSecretKeys(shieldedSecretKeys);
      const unshieldedWallet = UnshieldedWallet(buildUnshieldedConfig(config)).startWithPublicKey(
        PublicKey.fromKeyStore(unshieldedKeystore),
      );
      const dustWallet = DustWallet(buildDustConfig(config)).startWithSecretKey(
        dustSecretKey,
        ledger.LedgerParameters.initialParameters().dust,
      );

      const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
      await wallet.start(shieldedSecretKeys, dustSecretKey);

      return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
    },
  );

  const networkId = getNetworkId();
  const DIV = '──────────────────────────────────────────────────────────────';
  console.log(`
${DIV}
  pUSD Lending Protocol                      Network: ${networkId}
${DIV}
  Seed: ${seed}

  Unshielded Address (send tNight here):
  ${unshieldedKeystore.getBech32Address()}

  Fund your wallet with tNight from the faucet:
  https://faucet.preprod.midnight.network/
${DIV}
`);

  const syncedState = await withStatus('Syncing with network', () => waitForSync(wallet));
  printWalletSummary(seed, syncedState, unshieldedKeystore);

  const balance = syncedState.unshielded.balances[unshieldedToken().raw] ?? 0n;
  if (balance === 0n) {
    const fundedBalance = await withStatus('Waiting for incoming tokens', () => waitForFunds(wallet));
    console.log(`    Balance: ${formatBalance(fundedBalance)} tNight\n`);
  }

  await registerForDustGeneration(wallet, unshieldedKeystore);

  return { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };
};

export const buildFreshWallet = async (config: Config): Promise<WalletContext> =>
  await buildWalletAndWaitForFunds(config, toHex(Buffer.from(generateRandomSeed())));

// ─── Provider Configuration ───────────────────────────────────────────────────

export const configureProviders = async (ctx: WalletContext, config: Config): Promise<LendingProviders> => {
  const walletAndMidnightProvider = await createWalletAndMidnightProvider(ctx);
  const zkConfigProvider = new NodeZkConfigProvider<LendingCircuits>(contractConfig.zkConfigPath);
  return {
    privateStateProvider: levelPrivateStateProvider<LendingPrivateStateId>({
      privateStateStoreName: contractConfig.privateStateStoreName,
      walletProvider: walletAndMidnightProvider,
    }),
    publicDataProvider: indexerPublicDataProvider(config.indexer, config.indexerWS),
    zkConfigProvider,
    proofProvider: httpClientProofProvider(config.proofServer, zkConfigProvider),
    walletProvider: walletAndMidnightProvider,
    midnightProvider: walletAndMidnightProvider,
  };
};

// ─── Dust Balance Helpers ─────────────────────────────────────────────────────

export const getDustBalance = async (
  wallet: WalletFacade,
): Promise<{ available: bigint; pending: bigint; availableCoins: number; pendingCoins: number }> => {
  const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));
  const available = state.dust.walletBalance(new Date());
  const availableCoins = state.dust.availableCoins.length;
  const pendingCoins = state.dust.pendingCoins.length;
  const pending = state.dust.pendingCoins.reduce((sum, c) => sum + c.initialValue, 0n);
  return { available, pending, availableCoins, pendingCoins };
};

export const monitorDustBalance = async (wallet: WalletFacade, stopSignal: Promise<void>): Promise<void> => {
  let stopped = false;
  void stopSignal.then(() => { stopped = true; });

  const sub = wallet
    .state()
    .pipe(Rx.throttleTime(5_000), Rx.filter((s) => s.isSynced))
    .subscribe((state) => {
      if (stopped) return;
      const now = new Date();
      const available = state.dust.walletBalance(now);
      const availableCoins = state.dust.availableCoins.length;
      const pendingCoins = state.dust.pendingCoins.length;
      const registeredNight = state.unshielded.availableCoins.filter(
        (coin: any) => coin.meta?.registeredForDustGeneration === true,
      ).length;
      const totalNight = state.unshielded.availableCoins.length;

      let status = '';
      if (pendingCoins > 0 && availableCoins === 0) status = '⚠ locked by pending tx';
      else if (available > 0n) status = '✓ ready to transact';
      else if (availableCoins > 0) status = 'accruing...';
      else if (registeredNight > 0) status = 'waiting for generation...';
      else status = 'no NIGHT registered';

      console.log(
        `  [${now.toLocaleTimeString()}] DUST: ${formatBalance(available)} (${availableCoins} coins, ${pendingCoins} pending) | NIGHT: ${totalNight} UTXOs, ${registeredNight} registered | ${status}`,
      );
    });

  await stopSignal;
  sub.unsubscribe();
};

export function setLogger(_logger: Logger) {
  logger = _logger;
}
