import { Client } from "@urql/core";
import { fetchDisputes, fetchMinStake, fetchStake } from "./queries";

export default class RadioFilter {
  client: Client;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  minStakeReq: number;
  msgReplayReq = 3600000;
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor() {}

  public async setRequirement(client) {
    this.minStakeReq = await fetchMinStake(client);
  }

  public async indexerCheck(client: Client, address: string) {
    const senderStake = await fetchStake(client, address);
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

  public async poiMsgChecks(client: Client, sender: string, timestamp: number) {
    // Check for POI message validity
    //TODO: Resolve signer to indexer identity via registry, for now directly using sender address to query stake

    // Call the radio SDK for indexer identity check, set to 0 if did not meet the check
    const senderStake = await this.indexerCheck(client, sender);
    // Check that sender is not currently in any disputes...?
    // Simple: don't trust senders with token slashed history
    const tokensSlashed = await this.disputeStatusCheck(client, sender);
    // Message reply attack checks on timestamp, assume a 1 hour constant (3600000ms)
    if (
      senderStake == 0 ||
      !this.replyThreshold(timestamp) ||
      tokensSlashed > 0
    ) {
      console.debug(`Verifying message params`, {
        senderStake,
        tokensSlashed,
        attack: !this.replyThreshold(timestamp),
        msgAge: new Date().getTime() - timestamp,
      });
      return 0;
    }
    return senderStake - tokensSlashed;
  }
}
