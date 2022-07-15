import { ethers } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";

export class EthClient {
  provider: JsonRpcProvider;

  constructor() {
    const provider = new ethers.providers.JsonRpcProvider("https://mainnet.infura.io/v3/b0ee91cba1d44f6b83b3017b11f69ff3");
    this.provider = provider;
  }

  // The bit that interacts with the module
  // listen() {
  //   this.provider.on("block", async () => {
  //     const blockNumber = await this.provider.getBlockNumber();
  //   });
  // }

  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }
}
