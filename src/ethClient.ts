import { ethers, Wallet } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";

export class EthClient {
  provider: JsonRpcProvider;
  // wallet: Wallet;
  constructor() {
    const provider = new ethers.providers.JsonRpcProvider(
      `http://${process.env.ETH_NODE}`
    );
    this.provider = provider;

    // this.wallet = Wallet.fromMnemonic(process.env.RADIO_OPERATOR_MNEMONIC)
    // this.wallet = this.wallet.connect(provider)
  }

  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }
}
