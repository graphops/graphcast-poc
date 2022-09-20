import { Client } from "@urql/core";
import {
  fetchDisputes,
  fetchMinStake,
  fetchStake,
  fetchOperatorOfIndexers,
} from "./queries";
import { BlockPointer } from "./types";

const ONE_HOUR = 3_600_000;
export default class RadioFilter {
  msgReplayLimit: number;
  minStakeReq: number;
  //TODO: store state before process exit
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
  public async replayCheck(
    timestamp: number,
    blockHash: string,
    block: BlockPointer
  ) {
    const messageAge = new Date().getTime() - timestamp;
    return (
      messageAge <= 0 ||
      messageAge >= this.msgReplayLimit ||
      blockHash !== block.hash
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
    deployment: string,
    nonce: number,
    blockHash: string,
    block: BlockPointer
  ) {
    // Resolve signer to indexer identity and check stake and dispute statuses
    const indexerAddress = await this.isOperatorOf(client, sender);
    if (!indexerAddress) {
      console.warn(`👮 Sender not an operator, drop message`.red, { sender });
      return 0;
    }

    const senderStake = await this.indexerCheck(client, indexerAddress);
    const tokensSlashed = await this.disputeStatusCheck(client, indexerAddress);
    if (senderStake == 0 || tokensSlashed > 0) {
      console.warn(
        `👮 Indexer identity failed stake requirement or has been slashed, drop message`
          .red,
        {
          senderStake,
          tokensSlashed,
        }
      );
      return 0;
    }

    // Message param checks
    if (await this.replayCheck(nonce, blockHash, block)) {
      console.warn(`👮 Invalid timestamp (nonce), drop message`.red, {
        nonce,
        blockHash,
        queriedBlock: block.hash,
      });
      return 0;
    }
    if (this.inconsistentNonce(sender, deployment, nonce)) {
      console.warn(
        `👮 Inconsistent nonce or first time sender, drop message`.red,
        {
          sender,
          deployment,
          nonce,
        }
      );
      return 0;
    }
    return senderStake;
  }
}
