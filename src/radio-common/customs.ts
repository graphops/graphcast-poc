import { Client } from "@urql/core";
import {
  fetchDisputes,
  fetchMinStake,
  fetchOperators,
  fetchStake,
  fetchOperatorOfIndexers,
} from "./queries";
import { formatGRT } from "@graphprotocol/common-ts";
import { EthClient } from "../ethClient";

const ONE_HOUR = 3_600_000;
export default class RadioFilter {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  msgReplayReq: number;
  minStakeReq: number;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor() {
    this.msgReplayReq = ONE_HOUR;
    this.minStakeReq;
  }

  public async setRequirement(client: Client) {
    this.minStakeReq = await fetchMinStake(client);
  }

  public async isOperator(client: Client, indexer: string, sender: string) {
    return (await fetchOperatorOfIndexers(client, sender)).includes(indexer);
  }

  public async isOperatorOf(client: Client, sender: string) {
    console.log(`isOperatorOf`, {sender, opeartorOf: await fetchOperatorOfIndexers(client, sender)})
    return (await fetchOperatorOfIndexers(client, sender)).length !== 0;
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

  public replyThreshold(timestamp: number) {
    const messageAge = new Date().getTime() - timestamp;
    return messageAge < this.msgReplayReq;
  }

  public async disputeStatusCheck(client: Client, address: string) {
    const senderDisputes = await fetchDisputes(client, address);
    //Note: Disputes could be weighted by status and type, currently taking sum of indexer's token slashed
    return senderDisputes.reduce(
      (slashedRecord, dispute) => slashedRecord + Number(dispute.tokensSlashed),
      0
    );
  }

  public async poiMsgValidity(
    client: Client,
    sender: string,
    timestamp: number,
    senderIndexer: string
  ) {
    // Check for POI message validity

    // Resolve signer to indexer identity via registry
    const isOperatorOf = await this.isOperatorOf(client, sender);
    
    // Call the radio SDK for indexer identity check, set to 0 if did not meet the check
    const senderStake = await this.indexerCheck(client, senderIndexer);

    // Check that sender is not currently in any disputes?
    // Simple: don't trust senders with token slashed history
    const tokensSlashed = await this.disputeStatusCheck(client, senderIndexer);

    console.info(
      `Verifying message params, (TODO: Add skip opeartor check after updating the message format)`,
      {
        isOperatorOf,
        senderStake,
        tokensSlashed,
        replyAttack: !this.replyThreshold(timestamp),
        operatorWarning: !isOperatorOf ? `No match between the graph account of gossip client and supposed indexer address` : undefined
      }
    );
    // Message reply attack checks on timestamp, assume a 1 hour constant (3600000ms)
    if (
      senderStake == 0 ||
      !this.replyThreshold(timestamp) ||
      tokensSlashed > 0
    ) {
      return 0;
    }
    return senderStake - tokensSlashed;
  }
}
