// pUSD Lending Protocol — Express REST API Server
//
// Exposes the LendingService as HTTP endpoints on localhost:3001.
// The frontend calls these endpoints instead of interacting with the
// Midnight SDK directly (SDK requires Node.js, LevelDB, WebSocket, etc.).

import express from 'express';
import cors from 'cors';
import { LendingService } from './lending-service.js';
import { PreprodConfig, PreviewConfig, StandaloneConfig } from './config.js';

// ─── Network Selection ───────────────────────────────────────────────────────

const NETWORK = process.env.MIDNIGHT_NETWORK ?? 'preprod';
const PORT = parseInt(process.env.PORT ?? '3001', 10);

const configMap: Record<string, () => any> = {
    standalone: () => new StandaloneConfig(),
    preview: () => new PreviewConfig(),
    preprod: () => new PreprodConfig(),
};

const config = (configMap[NETWORK] ?? configMap.preprod)();
console.log(`[lending-api] Network: ${NETWORK} | Port: ${PORT}`);

const service = new LendingService(config);

// ─── Express App ─────────────────────────────────────────────────────────────

const app = express();
app.use(cors({ origin: ['http://localhost:5173', 'http://127.0.0.1:5173'] }));
app.use(express.json());

// BigInt serialization support
const bigIntReplacer = (_key: string, value: any) =>
    typeof value === 'bigint' ? value.toString() : value;

const sendJson = (res: express.Response, data: any, status = 200) => {
    res.status(status).type('application/json').send(JSON.stringify(data, bigIntReplacer));
};

// Wrap async route handlers with error handling
const asyncHandler = (fn: (req: express.Request, res: express.Response) => Promise<void>) =>
    (req: express.Request, res: express.Response) => {
        fn(req, res).catch((err: any) => {
            console.error(`[lending-api] Error:`, err?.message ?? err);
            const message = err?.message ?? 'Internal server error';

            // Categorize errors for the frontend
            let errorType = 'UNKNOWN';
            if (message.includes('Wallet not initialized')) errorType = 'WALLET_NOT_INITIALIZED';
            else if (message.includes('No contract deployed')) errorType = 'CONTRACT_NOT_DEPLOYED';
            else if (message.includes('Providers not configured')) errorType = 'WALLET_NOT_INITIALIZED';
            else if (message.includes('Deposit amount must be positive')) errorType = 'VALIDATION';
            else if (message.includes('Mint amount must be positive')) errorType = 'VALIDATION';
            else if (message.includes('Repay amount must be positive')) errorType = 'VALIDATION';
            else if (message.includes('Withdrawal amount must be positive')) errorType = 'VALIDATION';
            else if (message.includes('Cannot repay')) errorType = 'INSUFFICIENT_BALANCE';
            else if (message.includes('Cannot withdraw')) errorType = 'INSUFFICIENT_BALANCE';
            else if (message.includes('not liquidatable')) errorType = 'NOT_LIQUIDATABLE';
            else if (message.includes('Insufficient collateral')) errorType = 'COLLATERAL_RATIO';
            else if (message.includes('breach liquidation')) errorType = 'COLLATERAL_RATIO';
            else if (message.includes('ECONNREFUSED') && message.includes('6300')) errorType = 'PROOF_SERVER_DOWN';
            else if (message.includes('dust')) errorType = 'DUST_EXHAUSTED';

            sendJson(res, { error: message, errorType }, 400);
        });
    };

// ─── Health ──────────────────────────────────────────────────────────────────

app.get('/api/health', (_req, res) => {
    sendJson(res, {
        status: 'ok',
        network: NETWORK,
        walletInitialized: service.isWalletInitialized,
        contractDeployed: service.isContractDeployed,
        contractAddress: service.currentContractAddress,
    });
});

// ─── Wallet Endpoints ────────────────────────────────────────────────────────

app.post('/api/wallet/initialize', asyncHandler(async (req, res) => {
    const { seed } = req.body ?? {};
    const info = await service.initializeWallet(seed);
    sendJson(res, info);
}));

app.get('/api/wallet/info', asyncHandler(async (_req, res) => {
    const info = await service.getWalletInfo();
    sendJson(res, info);
}));

app.post('/api/wallet/wait-for-funds', asyncHandler(async (_req, res) => {
    const balance = await service.waitForFunds();
    sendJson(res, { balance });
}));

app.post('/api/wallet/register-dust', asyncHandler(async (_req, res) => {
    await service.registerDust();
    sendJson(res, { success: true });
}));

app.get('/api/wallet/dust', asyncHandler(async (_req, res) => {
    const dust = await service.getDustBalance();
    sendJson(res, dust);
}));

// ─── Contract Endpoints ──────────────────────────────────────────────────────

app.post('/api/contract/deploy', asyncHandler(async (_req, res) => {
    const address = await service.deployContract();
    sendJson(res, { contractAddress: address });
}));

app.post('/api/contract/join', asyncHandler(async (req, res) => {
    const { address } = req.body;
    if (!address) {
        sendJson(res, { error: 'address is required', errorType: 'VALIDATION' }, 400);
        return;
    }
    const contractAddress = await service.joinContract(address);
    sendJson(res, { contractAddress });
}));

// ─── Public State ────────────────────────────────────────────────────────────

app.get('/api/protocol/state', asyncHandler(async (_req, res) => {
    const state = await service.getPublicState();
    if (!state) {
        sendJson(res, { error: 'Contract not found', errorType: 'CONTRACT_NOT_FOUND' }, 404);
        return;
    }
    sendJson(res, state);
}));

// ─── Private State ───────────────────────────────────────────────────────────

app.get('/api/position', asyncHandler(async (_req, res) => {
    const position = await service.getMyPrivateState();
    sendJson(res, position);
}));

// ─── Lending Actions ─────────────────────────────────────────────────────────

app.post('/api/actions/deposit', asyncHandler(async (req, res) => {
    const { amount } = req.body;
    if (!amount) {
        sendJson(res, { error: 'amount is required', errorType: 'VALIDATION' }, 400);
        return;
    }
    const result = await service.deposit(BigInt(amount));
    sendJson(res, result);
}));

app.post('/api/actions/mint', asyncHandler(async (req, res) => {
    const { amount } = req.body;
    if (!amount) {
        sendJson(res, { error: 'amount is required', errorType: 'VALIDATION' }, 400);
        return;
    }
    const result = await service.mint(BigInt(amount));
    sendJson(res, result);
}));

app.post('/api/actions/repay', asyncHandler(async (req, res) => {
    const { amount } = req.body;
    if (!amount) {
        sendJson(res, { error: 'amount is required', errorType: 'VALIDATION' }, 400);
        return;
    }
    const result = await service.repay(BigInt(amount));
    sendJson(res, result);
}));

app.post('/api/actions/withdraw', asyncHandler(async (req, res) => {
    const { amount } = req.body;
    if (!amount) {
        sendJson(res, { error: 'amount is required', errorType: 'VALIDATION' }, 400);
        return;
    }
    const result = await service.withdraw(BigInt(amount));
    sendJson(res, result);
}));

app.post('/api/actions/liquidate', asyncHandler(async (req, res) => {
    const { victimCollateral, victimDebt } = req.body;
    if (!victimCollateral || !victimDebt) {
        sendJson(res, { error: 'victimCollateral and victimDebt are required', errorType: 'VALIDATION' }, 400);
        return;
    }
    const result = await service.liquidate(BigInt(victimCollateral), BigInt(victimDebt));
    sendJson(res, result);
}));

// ─── Start Server ────────────────────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`[lending-api] Server running at http://localhost:${PORT}`);
    console.log(`[lending-api] Endpoints:`);
    console.log(`  POST /api/wallet/initialize`);
    console.log(`  GET  /api/wallet/info`);
    console.log(`  POST /api/contract/deploy`);
    console.log(`  POST /api/contract/join`);
    console.log(`  GET  /api/protocol/state`);
    console.log(`  GET  /api/position`);
    console.log(`  POST /api/actions/deposit`);
    console.log(`  POST /api/actions/mint`);
    console.log(`  POST /api/actions/repay`);
    console.log(`  POST /api/actions/withdraw`);
    console.log(`  POST /api/actions/liquidate`);
});