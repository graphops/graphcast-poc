import { ethers, utils, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";

export class EthClient {
  provider: JsonRpcProvider;
  wallet: Wallet;

  constructor(api, private_key) {
    const provider = new ethers.providers.JsonRpcProvider(
      api
    );
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

  getAddress(): string {
    const publicKey = this.wallet.address;
    return publicKey;
  }
}
