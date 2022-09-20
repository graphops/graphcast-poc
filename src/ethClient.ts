import { ethers, utils, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";

type EthConstructorArgs = {
  operatorPrivateKey: string;
  ethNode?: string;
  infuraApiKey?: string;
  network?: string;
};

export class EthClient {
  provider: JsonRpcProvider;
  wallet: Wallet;

  constructor(args: EthConstructorArgs) {
    const { ethNode, operatorPrivateKey, infuraApiKey, network } = args;

    let provider: JsonRpcProvider;

    // TODO: Error handling
    if (
      ethNode !== null &&
      ethNode !== undefined
    ) {
      provider = new ethers.providers.JsonRpcProvider(ethNode);
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

  getAddress(): string {
    const publicKey = this.wallet.address;
    return publicKey;
  }
}
