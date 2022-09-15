import { ethers, utils, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";
import { Client, createClient } from "@urql/core";
import fetch from "isomorphic-fetch";

export class EthClient {
  provider: JsonRpcProvider;
  wallet: Wallet;

  constructor(api: string, private_key: string) {
    const provider = new ethers.providers.JsonRpcProvider(api);
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

export class ClientManager {
  ethNode: EthClient;
  networkSubgraph: Client;
  graphNodeStatus: Client;
  indexerManagement: Client;
  registry: Client;

  constructor(
    eth_node: string,
    privateKey: string,
    networkUrl: string,
    graphNodeStatus: string,
    indexerManagementServer: string,
    registry: string
  ) {
    this.ethNode = new EthClient(eth_node, privateKey);
    this.networkSubgraph = createClient({ url: networkUrl, fetch });
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
