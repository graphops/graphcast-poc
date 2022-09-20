import { Block } from "@ethersproject/providers";
import { Client } from "@urql/core";

import {
  fetchMinStake,
  fetchStake,
  fetchOperatorOfIndexers,
} from "./queries";

const ONE_HOUR = 3_600_000;
export default class RadioFilter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msgReplayLimit: number;
  minStakeReq: number;
  // Map sender identity to <topic -> nonce>    //TODO: store between sessions
  nonceDirectory: Map<string, Map<string, number>>;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor() {
    this.msgReplayLimit = ONE_HOUR;
    this.minStakeReq;
    this.nonceDirectory = new Map();
  }

  public async setRequirement(client: Client) {
    this.minStakeReq = await fetchMinStake(client);
  }

  public async isOperatorOf(client: Client, sender: string) {
    const res = await fetchOperatorOfIndexers(client, sender);
    return res ? res[0] : "";
  }

  public async isOperator(client: Client, sender: string) {
    return (await this.isOperatorOf(client, sender)).length !== 0;
  }

  public async indexerCheck(client: Client, address: string) {
    const senderStake = await fetchStake(client, address);
    if (!this.minStakeReq) {
      this.setRequirement(client);
    }
    if (senderStake < this.minStakeReq) {
      console.error(
        `Identity does not satisfy the minimum indexer stake, message discarded.`,
        {
          senderStake,
          minStake: this.minStakeReq,
        }
      );
      return 0;
    }
    return Number(senderStake);
  }

  // Message timestamp from within the past hour and match with block
  public async replayCheck(timestamp: number, blockHash: string, block: Block) {
    const messageAge = new Date().getTime() - timestamp;
    return (
      messageAge <= 0 ||
      messageAge >= this.msgReplayLimit ||
      blockHash !== block.hash ||
      timestamp < block.timestamp
    );
  }

  public inconsistentNonce(sender: string, deployment: string, nonce: number) {
    // check message nonce from local states for consistency
    if (!(sender in this.nonceDirectory)) {
      this.nonceDirectory[sender] = { [deployment]: nonce };
      return true;
    } else if (!(deployment in this.nonceDirectory[sender])) {
      this.nonceDirectory[sender][deployment] = nonce;
      return true;
    }

    const prevNonce: number = this.nonceDirectory[sender][deployment];

    return prevNonce >= nonce;
  }
}
