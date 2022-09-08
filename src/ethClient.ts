import { ethers, utils, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";

export class EthClient {
  provider: JsonRpcProvider;
  wallet: Wallet;

  constructor() {
    const provider = new ethers.providers.JsonRpcProvider(
      `http://${process.env.ETH_NODE}`
    );
    this.provider = provider;

    const wallet = new Wallet(process.env.RADIO_OPERATOR_PRIVATE_KEY);
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
