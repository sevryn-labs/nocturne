// pUSD Lending Protocol — Network Configuration for API Server

import path from 'node:path';
import { setNetworkId } from '@midnight-ntwrk/midnight-js-network-id';
export const currentDir = path.resolve(new URL(import.meta.url).pathname, '..');

export const contractConfig = {
    privateStateStoreName: 'lending-private-state-api',
    zkConfigPath: path.resolve(currentDir, '..', '..', 'contract', 'src', 'managed', 'lending'),
};

export interface Config {
    readonly indexer: string;
    readonly indexerWS: string;
    readonly node: string;
    readonly proofServer: string;
}

export class StandaloneConfig implements Config {
    indexer = 'http://127.0.0.1:8088/api/v3/graphql';
    indexerWS = 'ws://127.0.0.1:8088/api/v3/graphql/ws';
    node = 'http://127.0.0.1:9944';
    proofServer = 'http://127.0.0.1:6300';
    constructor() {
        setNetworkId('undeployed');
    }
}

export class PreviewConfig implements Config {
    indexer = 'https://indexer.preview.midnight.network/api/v3/graphql';
    indexerWS = 'wss://indexer.preview.midnight.network/api/v3/graphql/ws';
    node = 'https://rpc.preview.midnight.network';
    proofServer = 'http://127.0.0.1:6300';
    constructor() {
        setNetworkId('preview');
    }
}

export class PreprodConfig implements Config {
    indexer = 'https://indexer.preprod.midnight.network/api/v3/graphql';
    indexerWS = 'wss://indexer.preprod.midnight.network/api/v3/graphql/ws';
    node = 'https://rpc.preprod.midnight.network';
    proofServer = 'http://127.0.0.1:6300';
    constructor() {
        setNetworkId('preprod');
    }
}
