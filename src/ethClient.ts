import { ethers, utils, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Client, createClient } from "@urql/core";
import fetch from "isomorphic-fetch";

export class EthClient {
  provider: JsonRpcProvider;
  wallet: Wallet;

  constructor(url: string, private_key: string) {
    const provider = new ethers.providers.JsonRpcProvider(url);
    this.provider = provider;

    const wallet = new Wallet(private_key);
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
      registry,
      graphNodeStatus,
      indexerManagementServer,
    } = args;

    this.ethClient = new EthClient(ethNodeUrl, operatorPrivateKey);
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
