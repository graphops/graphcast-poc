import { Block } from "@ethersproject/providers";
import { Client } from "@urql/core";
import {
  fetchDisputes,
  fetchMinStake,
  fetchOperators,
  fetchStake,
  fetchOperatorOfIndexers,
} from "./queries";

const ONE_HOUR = 3_600_000;
export default class RadioFilter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msgReplayLimit: number;
  minStakeReq: number;
  // Map sender identity to <nonce>
  nonceDirectory: Map<string, number>;
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
  public async replayCheck(timestamp: number, blockHash:string, block: Block) {
    const messageAge = new Date().getTime() - timestamp;
    return messageAge <= 0 || messageAge >= this.msgReplayLimit || blockHash !== block.hash ||
          timestamp < block.timestamp;
  }

  public inconsistentNonce(
    sender: string,
    nonce: number,
  ) {
    // Correct block hash and message sent after block
    // we said to drop the first message and add the nonce for future
    //TODO: store the state somewhere 
    const prevNonce:number = (sender in this.nonceDirectory) ? this.nonceDirectory[sender] : (this.nonceDirectory[sender] = nonce, Number.NEGATIVE_INFINITY);
    console.log(`prev`, {prevNonce, nonce, inconsistent: prevNonce +1 !== nonce})
    // can be more lean and allow a greater nonce
    return prevNonce +1 !== nonce;
  }

  public async disputeStatusCheck(client: Client, address: string) {
    const senderDisputes = await fetchDisputes(client, address);
    //Note: a more relaxed check is if there's dispute with Undecided status
    return senderDisputes.reduce(
      (slashedRecord, dispute) => slashedRecord + Number(dispute.tokensSlashed),
      0
    );
  }

  public async poiMsgValidity(
    client: Client,
    sender: string,
    timestamp: number,
    nonce: number,
    blockHash: string,
    block: Block
  ) {
    // Resolve signer to indexer identity and check stake and dispute statuses
    const indexerAddress = await this.isOperatorOf(client, sender);
    if (!indexerAddress) {
      console.warn(`👮 Sender not an operator, drop message`);
      return 0;
    }
    const senderStake = await this.indexerCheck(client, indexerAddress);
    const tokensSlashed = await this.disputeStatusCheck(client, indexerAddress);
    if (senderStake == 0 || tokensSlashed > 0) {
      console.warn(
        `👮 Indexer identity failed stake requirement or has been slashed, drop message`
      );
      return 0;
    }

    // Message param checks
    if (await this.replayCheck(timestamp, blockHash, block)){
      console.warn(
        `👮 Invalid timestamps, drop message`, {
          timestamp,
          blockHash,
          queriedBlock: block.hash,
        }
      );
      return 0
    } 
    if (this.inconsistentNonce(
      sender,
      nonce,
    )){
      console.warn(
        `👮 Invalid nonce from sender, drop message`
      );
      return 0;
    }
    return senderStake
  }
}
