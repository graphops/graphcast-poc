import { ethers, utils, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Client, createClient } from "@urql/core";
import fetch from "isomorphic-fetch";

// Move to sdk level types
type EthConstructorArgs = {
  operatorPrivateKey: string;
  ethNodeUrl?: string;
  infuraApiKey?: string;
  network?: string;
};

export class EthClient {
  provider: JsonRpcProvider;
  wallet: Wallet;

  constructor(args: EthConstructorArgs) {
    const { ethNodeUrl, operatorPrivateKey, infuraApiKey, network } = args;

    let provider: JsonRpcProvider;

    // TODO: Error handling
    if (ethNodeUrl !== null && ethNodeUrl !== undefined) {
      provider = new ethers.providers.JsonRpcProvider(ethNodeUrl);
    } else if (
      infuraApiKey !== null &&
      infuraApiKey !== undefined &&
      network !== undefined &&
      network !== undefined
    ) {
      provider = new ethers.providers.InfuraProvider(
        network,
        process.env.INFURA_API_KEY
      );
    }

    this.provider = provider;

    const wallet = new Wallet(operatorPrivateKey);
    this.wallet = wallet.connect(provider);
  }

  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  async getEthBalance(): Promise<number> {
    const balance = await this.wallet.getBalance();
    return parseFloat(utils.formatEther(balance));
  }

  async buildBlock(blockNumber: number) {
    const block = await this.provider.getBlock(blockNumber);
    return { number: blockNumber, hash: block.hash };
  }

  getAddress(): string {
    const publicKey = this.wallet.address;
    return publicKey;
  }
}

// TODO: Move to sdk level types
type ClientManagerArgs = {
  ethNodeUrl?: string;
  operatorPrivateKey: string;
  graphNetworkUrl: string;
  infuraApiKey?: string;
  infuraNetwork?: string;
  registry: string;
  graphNodeStatus: string;
  indexerManagementServer: string;
};

export class ClientManager {
  ethClient: EthClient;
  networkSubgraph: Client;
  graphNodeStatus: Client;
  indexerManagement: Client;
  registry: Client;

  constructor(args: ClientManagerArgs) {
    const {
      ethNodeUrl,
      operatorPrivateKey,
      graphNetworkUrl,
      infuraApiKey,
      infuraNetwork,
      registry,
      graphNodeStatus,
      indexerManagementServer,
    } = args;

    this.ethClient = new EthClient({
      ethNodeUrl: ethNodeUrl || null,
      operatorPrivateKey,
      infuraApiKey: infuraApiKey || null,
      network: infuraNetwork || null,
    });
    this.networkSubgraph = createClient({ url: graphNetworkUrl, fetch });
    this.graphNodeStatus = createClient({
      url: graphNodeStatus,
      fetch,
    });
    this.indexerManagement = createClient({
      url: indexerManagementServer,
      fetch,
    });
    this.registry = createClient({
      url: registry,
      fetch,
    });
  }
}
