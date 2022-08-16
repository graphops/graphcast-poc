import {
  registryABI,
  registryAddress,
} from "./registry-contract/registryContract";
import { ethers } from "ethers";
import { JsonRpcProvider } from "@ethersproject/providers";

export class EthClient {
  provider: JsonRpcProvider;
  goerliProvider: JsonRpcProvider;
  registryContract: ethers.Contract;

  constructor() {
    const provider = new ethers.providers.JsonRpcProvider(
      `http://${process.env.ETH_NODE}`
    );
    const goerliProvider = new ethers.providers.JsonRpcProvider(
      process.env.GOERLI_NODE
    );
    this.provider = provider;
    this.goerliProvider = goerliProvider;
    this.registryContract = new ethers.Contract(
      registryAddress,
      registryABI,
      goerliProvider
    );
  }

  async getBlockNumber(): Promise<number> {
    return await this.provider.getBlockNumber();
  }

  async checkRegistry(indexerAddress: string, operatorAddress: string) {
    console.log(`check registry`, { contract: this.registryContract });
    return await this.registryContract.operatorAuth(
      indexerAddress,
      operatorAddress
    );
  }
}
