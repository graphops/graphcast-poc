import { ethers } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";

export class EthClient {
  provider: JsonRpcProvider;

  constructor() {
    const provider = new ethers.providers.JsonRpcProvider(`http://${process.env.LOCALHOST}:8545`);
    this.provider = provider;
  }

  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }
}
