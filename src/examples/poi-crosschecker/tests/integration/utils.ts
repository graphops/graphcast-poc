import { Logger } from "@graphprotocol/common-ts";
import { ethers } from "ethers";
import { NPOIRecord } from "../../types";
import { sleep } from "../../utils";

export const checkBlock = async (logger: Logger) => {
  const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_NODE);

  let block = await provider.getBlockNumber();
  if (block % 5 === 0) {
    logger.warning(
      "DB clearing block. Waiting for next block before compairing... "
    );

    let newBlock = await provider.getBlockNumber();
    while (newBlock === block) {
      sleep(1000);
      newBlock = await provider.getBlockNumber();
    }
    block = newBlock;
  }
};

export const dedupeRecords = (arr: NPOIRecord[], key: string) => {
  return [...new Map(arr.map(item => [item[key], item])).values()]
}
