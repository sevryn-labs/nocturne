// pUSD Lending Protocol — Core Lending Service
//
// Wraps all wallet, provider, and contract logic into a stateful service
// that the Express server can call. Extracted from lending-cli/src/api.ts,
// adapted to be framework-agnostic (no CLI spinners, no process.stdout).

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
import * as Rx from 'rxjs';
import { WebSocket } from 'ws';
import {
    type LendingCircuits,
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

// Required for GraphQL subscriptions (wallet sync) to work in Node.js
// @ts-expect-error: Required for Apollo WS transport
globalThis.WebSocket = WebSocket;

// ─── Compiled Contract ───────────────────────────────────────────────────────

const lendingCompiledContract = CompiledContract.make('lending', Lending.Contract).pipe(
    CompiledContract.withWitnesses(witnesses),
    CompiledContract.withCompiledFileAssets(contractConfig.zkConfigPath),
);

// ─── Internal Types ──────────────────────────────────────────────────────────

interface WalletContext {
    wallet: WalletFacade;
    shieldedSecretKeys: ledger.ZswapSecretKeys;
    dustSecretKey: ledger.DustSecretKey;
    unshieldedKeystore: UnshieldedKeystore;
}

export interface WalletInfo {
    seed: string;
    network: string;
    unshieldedAddress: string;
    shieldedAddress: string;
    dustAddress: string;
    unshieldedBalance: string;
    dustBalance: string;
    isSynced: boolean;
    coinPublicKey: string;
}

export interface TxResult {
    txHash: string;
    blockHeight: bigint;
}

// ─── Service ─────────────────────────────────────────────────────────────────

export class LendingService {
    private walletCtx: WalletContext | null = null;
    private providers: LendingProviders | null = null;
    private contract: DeployedLendingContract | null = null;
    private contractAddress: string | null = null;
    private seed: string | null = null;
    private config: Config;
    private walletInitPromise: Promise<WalletInfo> | null = null;
    private contractJoinPromise: Promise<string> | null = null;
    private contractDeployPromise: Promise<string> | null = null;

    constructor(config: Config) {
        this.config = config;
    }

    // ─── State Getters ───────────────────────────────────────────────────────

    get isWalletInitialized(): boolean {
        return this.walletCtx !== null;
    }

    get isContractDeployed(): boolean {
        return this.contract !== null;
    }

    get currentContractAddress(): string | null {
        return this.contractAddress;
    }

    // ─── Wallet ──────────────────────────────────────────────────────────────

    async initializeWallet(existingSeed?: string): Promise<WalletInfo> {
        if (this.walletCtx && this.providers) {
            return this.getWalletInfo();
        }

        if (this.walletInitPromise) {
            return this.walletInitPromise;
        }

        this.walletInitPromise = this._initializeWalletInternal(existingSeed);
        try {
            return await this.walletInitPromise;
        } finally {
            this.walletInitPromise = null;
        }
    }

    private async _initializeWalletInternal(existingSeed?: string): Promise<WalletInfo> {
        const seed = existingSeed ?? toHex(Buffer.from(generateRandomSeed()));
        this.seed = seed;

        const keys = this.deriveKeysFromSeed(seed);
        const shieldedSecretKeys = ledger.ZswapSecretKeys.fromSeed(keys[Roles.Zswap]);
        const dustSecretKey = ledger.DustSecretKey.fromSeed(keys[Roles.Dust]);
        const unshieldedKeystore = createKeystore(keys[Roles.NightExternal], getNetworkId());

        const shieldedWallet = ShieldedWallet(this.buildShieldedConfig()).startWithSecretKeys(shieldedSecretKeys);
        const unshieldedWallet = UnshieldedWallet(this.buildUnshieldedConfig()).startWithPublicKey(
            PublicKey.fromKeyStore(unshieldedKeystore),
        );
        const dustWallet = DustWallet(this.buildDustConfig()).startWithSecretKey(
            dustSecretKey,
            ledger.LedgerParameters.initialParameters().dust,
        );

        const wallet = new WalletFacade(shieldedWallet, unshieldedWallet, dustWallet);
        await wallet.start(shieldedSecretKeys, dustSecretKey);

        this.walletCtx = { wallet, shieldedSecretKeys, dustSecretKey, unshieldedKeystore };

        // Wait for sync
        const state = await Rx.firstValueFrom(
            wallet.state().pipe(
                Rx.throttleTime(3_000),
                Rx.filter((s) => s.isSynced),
            ),
        );

        // Configure providers
        await this.configureProviders();

        // Warm up the LevelDB instance sequentially so later concurrent API requests 
        // don't try to lazy-open it at the exact same time
        try {
            await this.providers!.privateStateProvider.get(LendingPrivateStateId);
        } catch {
            // Ignore if it fails, it just means the state isn't there yet, but DB is opened.
        }

        return this.buildWalletInfo(state);
    }

    async getWalletInfo(): Promise<WalletInfo> {
        this.requireWallet();
        const state = await Rx.firstValueFrom(
            this.walletCtx!.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
        );
        return this.buildWalletInfo(state);
    }

    async waitForFunds(): Promise<string> {
        this.requireWallet();
        const balance = await Rx.firstValueFrom(
            this.walletCtx!.wallet.state().pipe(
                Rx.throttleTime(10_000),
                Rx.filter((s) => s.isSynced),
                Rx.map((s) => s.unshielded.balances[unshieldedToken().raw] ?? 0n),
                Rx.filter((balance) => balance > 0n),
            ),
        );
        return balance.toString();
    }

    async registerDust(): Promise<void> {
        this.requireWallet();
        const { wallet, unshieldedKeystore } = this.walletCtx!;

        const state = await Rx.firstValueFrom(wallet.state().pipe(Rx.filter((s) => s.isSynced)));

        if (state.dust.availableCoins.length > 0) return;

        const nightUtxos = state.unshielded.availableCoins.filter(
            (coin: any) => coin.meta?.registeredForDustGeneration !== true,
        );

        if (nightUtxos.length > 0) {
            const recipe = await wallet.registerNightUtxosForDustGeneration(
                nightUtxos,
                unshieldedKeystore.getPublicKey(),
                (payload) => unshieldedKeystore.signData(payload),
            );
            const finalized = await wallet.finalizeRecipe(recipe);
            await wallet.submitTransaction(finalized);
        }

        // Wait for dust
        await Rx.firstValueFrom(
            wallet.state().pipe(
                Rx.throttleTime(5_000),
                Rx.filter((s) => s.isSynced),
                Rx.filter((s) => s.dust.walletBalance(new Date()) > 0n),
            ),
        );
    }

    async getDustBalance(): Promise<{ available: string; pending: string }> {
        this.requireWallet();
        const state = await Rx.firstValueFrom(
            this.walletCtx!.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
        );
        const available = state.dust.walletBalance(new Date());
        const pending = state.dust.pendingCoins.reduce((sum: bigint, c: any) => sum + c.initialValue, 0n);
        return { available: available.toString(), pending: pending.toString() };
    }

    // ─── Contract ────────────────────────────────────────────────────────────

    async deployContract(): Promise<string> {
        this.requireProviders();

        if (this.contractDeployPromise) return this.contractDeployPromise;

        this.contractDeployPromise = (async () => {
            try {
                const contract = await deployContract(this.providers!, {
                    compiledContract: lendingCompiledContract,
                    privateStateId: LendingPrivateStateId,
                    initialPrivateState: initialLendingPrivateState,
                });

                this.contract = contract;
                this.contractAddress = contract.deployTxData.public.contractAddress;
                return this.contractAddress;
            } finally {
                this.contractDeployPromise = null;
            }
        })();

        return this.contractDeployPromise;
    }

    async joinContract(address: string): Promise<string> {
        this.requireProviders();

        if (this.contractAddress === address) return this.contractAddress;

        if (this.contractJoinPromise) return this.contractJoinPromise;

        this.contractJoinPromise = (async () => {
            try {
                // Preserve existing private state before rejoining — findDeployedContract
                // will write initialPrivateState, which would reset our position.
                const existingState = await this.providers!.privateStateProvider.get(LendingPrivateStateId);

                const contract = await findDeployedContract(this.providers!, {
                    contractAddress: address,
                    compiledContract: lendingCompiledContract,
                    privateStateId: LendingPrivateStateId,
                    initialPrivateState: existingState ?? initialLendingPrivateState,
                });

                this.contract = contract;
                this.contractAddress = contract.deployTxData.public.contractAddress;

                // Restore private state if it was overwritten by findDeployedContract
                if (existingState) {
                    await this.providers!.privateStateProvider.set(LendingPrivateStateId, existingState);
                }

                return this.contractAddress;
            } finally {
                this.contractJoinPromise = null;
            }
        })();

        return this.contractJoinPromise;
    }

    // ─── Public State ────────────────────────────────────────────────────────

    async getPublicState(): Promise<ProtocolState | null> {
        this.requireProviders();
        if (!this.contractAddress) throw new Error('No contract deployed or joined');

        assertIsContractAddress(this.contractAddress);
        const contractState = await this.providers!.publicDataProvider.queryContractState(this.contractAddress);
        if (contractState == null) return null;

        const lstate = Lending.ledger(contractState.data) as any;
        // Cast to any: stale generated types will be resolved after `npm run compact`.
        return {
            totalCollateral: lstate.totalCollateral as bigint,
            totalDebt: lstate.totalDebt as bigint,
            liquidationRatio: lstate.liquidationRatio as bigint,
            mintingRatio: lstate.mintingRatio as bigint,
            // _totalSupply always equals totalDebt (supply == debt invariant)
            totalSupply: (lstate._totalSupply as bigint | undefined) ?? 0n,
        };
    }

    // ─── Private State ───────────────────────────────────────────────────────

    async getMyPrivateState(): Promise<UserPosition> {
        this.requireProviders();

        const ps = await this.providers!.privateStateProvider.get(LendingPrivateStateId);
        const state: LendingPrivateState = ps ?? initialLendingPrivateState;

        const { collateralAmount, debtAmount } = state;
        let collateralRatio = 0n;
        let isLiquidatable = false;

        if (debtAmount > 0n) {
            collateralRatio = (collateralAmount * 100n) / debtAmount;
            isLiquidatable = collateralRatio < 150n;
        }

        return { collateralAmount, debtAmount, collateralRatio, isLiquidatable };
    }

    // ─── Lending Operations ──────────────────────────────────────────────────

    async deposit(amount: bigint): Promise<TxResult> {
        this.requireContract();
        if (amount <= 0n) throw new Error('Deposit amount must be positive');

        const txData = await this.contract!.callTx.depositCollateral(amount);

        await this.updatePrivateState((s) => ({
            ...s,
            collateralAmount: s.collateralAmount + amount,
        }));

        return { txHash: txData.public.txHash, blockHeight: BigInt(txData.public.blockHeight) };
    }

    async mint(amount: bigint): Promise<TxResult> {
        this.requireContract();
        if (amount <= 0n) throw new Error('Mint amount must be positive');

        const txData = await this.contract!.callTx.mintPUSD(amount);

        await this.updatePrivateState((s) => ({
            ...s,
            debtAmount: s.debtAmount + amount,
        }));

        return { txHash: txData.public.txHash, blockHeight: BigInt(txData.public.blockHeight) };
    }

    async repay(amount: bigint): Promise<TxResult> {
        this.requireContract();
        if (amount <= 0n) throw new Error('Repay amount must be positive');

        const ps = await this.providers!.privateStateProvider.get(LendingPrivateStateId);
        const state = ps ?? initialLendingPrivateState;
        if (state.debtAmount < amount) {
            throw new Error(`Cannot repay ${amount} — current debt is only ${state.debtAmount}`);
        }

        // The circuit burns `amount` pUSD from the caller's token balance
        // AND decrements totalDebt — both happen atomically in the ZK proof.
        // The caller must hold >= amount pUSD tokens in their wallet.
        const txData = await this.contract!.callTx.repayPUSD(amount);

        await this.updatePrivateState((s) => ({
            ...s,
            debtAmount: s.debtAmount - amount,
        }));

        return { txHash: txData.public.txHash, blockHeight: BigInt(txData.public.blockHeight) };
    }

    async withdraw(amount: bigint): Promise<TxResult> {
        this.requireContract();
        if (amount <= 0n) throw new Error('Withdrawal amount must be positive');

        const ps = await this.providers!.privateStateProvider.get(LendingPrivateStateId);
        const state = ps ?? initialLendingPrivateState;
        if (state.collateralAmount < amount) {
            throw new Error(`Cannot withdraw ${amount} — only ${state.collateralAmount} deposited`);
        }

        const txData = await this.contract!.callTx.withdrawCollateral(amount);

        await this.updatePrivateState((s) => ({
            ...s,
            collateralAmount: s.collateralAmount - amount,
        }));

        return { txHash: txData.public.txHash, blockHeight: BigInt(txData.public.blockHeight) };
    }

    async liquidate(victimCollateral: bigint, victimDebt: bigint): Promise<TxResult> {
        this.requireContract();
        if (victimDebt <= 0n) throw new Error('victimDebt must be positive');
        if (victimCollateral <= 0n) throw new Error('victimCollateral must be positive');

        const ratio = (victimCollateral * 100n) / victimDebt;
        if (ratio >= 150n) {
            throw new Error(`Position ratio is ${ratio}% — not liquidatable (must be < 150%)`);
        }

        // IMPORTANT: The caller must hold >= victimDebt pUSD tokens.
        // The circuit burns those tokens AND reduces totalDebt + totalCollateral
        // atomically. Invariant: _totalSupply == totalDebt after liquidation.
        const txData = await this.contract!.callTx.liquidate(victimCollateral, victimDebt);

        return { txHash: txData.public.txHash, blockHeight: BigInt(txData.public.blockHeight) };
    }

    /**
     * Query the pUSD token balance (public ledger) for self or any address.
     * Reads directly from the public ledger _balances map.
     * The key must be converted from hex to { bytes: Uint8Array } to match
     * the ZswapCoinPublicKey struct expected by the Compact-generated Ledger.
     */
    async getPUSDBalance(publicKeyHex?: string): Promise<bigint> {
        this.requireProviders();
        if (!this.contractAddress) throw new Error('No contract deployed or joined');

        // Resolve public key: caller's own key if not specified
        const keyHex = publicKeyHex ?? (await this.getOwnCoinPublicKey());
        if (!keyHex) return 0n;

        assertIsContractAddress(this.contractAddress);
        const contractState = await this.providers!.publicDataProvider.queryContractState(this.contractAddress);
        if (contractState == null) return 0n;

        const lstate = Lending.ledger(contractState.data);
        try {
            // Convert hex string to the { bytes: Uint8Array } struct that _balances expects
            const key = { bytes: Uint8Array.from(Buffer.from(keyHex, 'hex')) };
            if (!lstate._balances.member(key)) return 0n;
            return lstate._balances.lookup(key);
        } catch {
            return 0n;
        }
    }

    /** Returns shielded coin public key hex of the current wallet. */
    async getOwnCoinPublicKey(): Promise<string | null> {
        if (!this.walletCtx) return null;
        const state = await Rx.firstValueFrom(
            this.walletCtx.wallet.state().pipe(Rx.filter((s) => s.isSynced)),
        );
        return state.shielded.coinPublicKey.toHexString();
    }

    /**
     * Transfer `amount` pUSD to `toPublicKeyHex`.
     * Caller must hold >= amount pUSD tokens (checked in-circuit).
     */
    async transferPUSD(toPublicKeyHex: string, amount: bigint): Promise<TxResult> {
        this.requireContract();
        if (amount <= 0n) throw new Error('Transfer amount must be positive');

        // Validate balance before submitting to avoid wasting dust and proof generation
        const ownKey = await this.getOwnCoinPublicKey();
        if (ownKey) {
            const balance = await this.getPUSDBalance(ownKey);
            if (balance < amount) {
                throw new Error(`Insufficient pUSD balance: have ${balance}, need ${amount}`);
            }
        }

        const to = { bytes: Uint8Array.from(Buffer.from(toPublicKeyHex, 'hex')) };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const txData = await (this.contract!.callTx as any).transfer(to, amount);
        return { txHash: txData.public.txHash, blockHeight: BigInt(txData.public.blockHeight) };
    }

    /**
     * Approve `spenderPublicKeyHex` to spend up to `amount` pUSD.
     */
    async approvePUSD(spenderPublicKeyHex: string, amount: bigint): Promise<TxResult> {
        this.requireContract();
        const spender = { bytes: Uint8Array.from(Buffer.from(spenderPublicKeyHex, 'hex')) };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const txData = await (this.contract!.callTx as any).approve(spender, amount);
        return { txHash: txData.public.txHash, blockHeight: BigInt(txData.public.blockHeight) };
    }

    /**
     * Transfer pUSD from `fromPublicKeyHex` to `toPublicKeyHex` using allowance.
     */
    async transferPUSDFrom(fromPublicKeyHex: string, toPublicKeyHex: string, amount: bigint): Promise<TxResult> {
        this.requireContract();
        if (amount <= 0n) throw new Error('Transfer amount must be positive');
        const fromObj = { bytes: Uint8Array.from(Buffer.from(fromPublicKeyHex, 'hex')) };
        const toObj = { bytes: Uint8Array.from(Buffer.from(toPublicKeyHex, 'hex')) };
        // eslint-disable-next-line @typescript-eslint/no-unsafe-call
        const txData = await (this.contract!.callTx as any).transferFrom(fromObj, toObj, amount);
        return { txHash: txData.public.txHash, blockHeight: BigInt(txData.public.blockHeight) };
    }

    // ─── Private Helpers ─────────────────────────────────────────────────────

    private requireWallet(): void {
        if (!this.walletCtx) throw new Error('Wallet not initialized. Call initializeWallet() first.');
    }

    private requireProviders(): void {
        if (!this.providers) throw new Error('Providers not configured. Call initializeWallet() first.');
    }

    private requireContract(): void {
        this.requireProviders();
        if (!this.contract) throw new Error('No contract deployed or joined. Call deployContract() or joinContract() first.');
    }

    private async updatePrivateState(
        updater: (current: LendingPrivateState) => LendingPrivateState,
    ): Promise<void> {
        const current =
            (await this.providers!.privateStateProvider.get(LendingPrivateStateId)) ?? initialLendingPrivateState;
        const next = updater(current);
        await this.providers!.privateStateProvider.set(LendingPrivateStateId, next);
    }

    private async configureProviders(): Promise<void> {
        this.requireWallet();
        const walletAndMidnightProvider = await this.createWalletAndMidnightProvider();
        const zkConfigProvider = new NodeZkConfigProvider<LendingCircuits>(contractConfig.zkConfigPath);
        this.providers = {
            privateStateProvider: levelPrivateStateProvider<LendingPrivateStateId>({
                privateStateStoreName: contractConfig.privateStateStoreName,
                walletProvider: walletAndMidnightProvider,
            }),
            publicDataProvider: indexerPublicDataProvider(this.config.indexer, this.config.indexerWS),
            zkConfigProvider,
            proofProvider: httpClientProofProvider(this.config.proofServer, zkConfigProvider),
            walletProvider: walletAndMidnightProvider,
            midnightProvider: walletAndMidnightProvider,
        };
    }

    private async createWalletAndMidnightProvider(): Promise<WalletProvider & MidnightProvider> {
        const ctx = this.walletCtx!;
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
    }

    private deriveKeysFromSeed(seed: string) {
        const hdWallet = HDWallet.fromSeed(Buffer.from(seed, 'hex'));
        if (hdWallet.type !== 'seedOk') throw new Error('Failed to initialize HDWallet from seed');

        const derivationResult = hdWallet.hdWallet
            .selectAccount(0)
            .selectRoles([Roles.Zswap, Roles.NightExternal, Roles.Dust])
            .deriveKeysAt(0);

        if (derivationResult.type !== 'keysDerived') throw new Error('Failed to derive keys');
        hdWallet.hdWallet.clear();
        return derivationResult.keys;
    }

    private buildShieldedConfig() {
        return {
            networkId: getNetworkId(),
            indexerClientConnection: { indexerHttpUrl: this.config.indexer, indexerWsUrl: this.config.indexerWS },
            provingServerUrl: new URL(this.config.proofServer),
            relayURL: new URL(this.config.node.replace(/^http/, 'ws')),
        };
    }

    private buildUnshieldedConfig() {
        return {
            networkId: getNetworkId(),
            indexerClientConnection: { indexerHttpUrl: this.config.indexer, indexerWsUrl: this.config.indexerWS },
            txHistoryStorage: new InMemoryTransactionHistoryStorage(),
        };
    }

    private buildDustConfig() {
        return {
            networkId: getNetworkId(),
            costParameters: { additionalFeeOverhead: 300_000_000_000_000n, feeBlocksMargin: 5 },
            indexerClientConnection: { indexerHttpUrl: this.config.indexer, indexerWsUrl: this.config.indexerWS },
            provingServerUrl: new URL(this.config.proofServer),
            relayURL: new URL(this.config.node.replace(/^http/, 'ws')),
        };
    }
    private buildWalletInfo(state: any): WalletInfo {
        const networkId = getNetworkId();

        const unshieldedBalance = state.unshielded.balances[unshieldedToken().raw] ?? 0n;
        const dustBalance = state.dust.walletBalance(new Date());

        const coinPublicKeyHex = state.shielded.coinPublicKey.toHexString();

        const coinPubKey = ShieldedCoinPublicKey.fromHexString(coinPublicKeyHex);
        const encPubKey = ShieldedEncryptionPublicKey.fromHexString(
            state.shielded.encryptionPublicKey.toHexString()
        );

        const shieldedAddress = MidnightBech32m.encode(
            networkId,
            new ShieldedAddress(coinPubKey, encPubKey)
        ).toString();

        return {
            seed: this.seed!,
            network: String(networkId),
            unshieldedAddress: this.walletCtx!.unshieldedKeystore.getBech32Address().toString(),
            shieldedAddress,
            coinPublicKey: coinPublicKeyHex,   // <-- ADD THIS
            dustAddress: state.dust.dustAddress?.toString() ?? '',
            unshieldedBalance: unshieldedBalance.toString(),
            dustBalance: dustBalance.toString(),
            isSynced: state.isSynced,
        };
    }
}

// ─── signRecipe workaround (shared with lending-cli) ─────────────────────────

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