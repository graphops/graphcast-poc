import { formatUnits } from "ethers/lib/utils";
import { Client, gql } from "@urql/core";
import { BlockPointer, Dispute, MessageValidityArgs } from "./types";
import { Logger } from "@graphprotocol/common-ts";
import {
  indexerOperatorQuery,
  operatorOfIndexerQuery,
  indexerStakeQuery,
  disputeIndexerQuery,
} from "./queries";

const ONE_HOUR = 3_600_000;

// Message validity logic class
export default class RadioFilter {
  networkSubgraph: Client;
  registry: Client;
  logger: Logger;
  msgReplayLimit: number;
  minStakeReq: number;
  nonceDirectory: Map<string, Map<string, number>>;

  // eslint-disable-next-line @typescript-eslint/no-empty-function
  constructor(parentLogger: Logger, networkSubgraph: Client, registry: Client) {
    this.msgReplayLimit = ONE_HOUR;
    this.minStakeReq;
    this.nonceDirectory = new Map();
    this.logger = parentLogger.child({
      component: "Radio filter",
    });
    this.networkSubgraph = networkSubgraph;
    this.registry = registry;
  }

  public async isOperatorOf(sender: string) {
    const res = await this.fetchOperatorOfIndexers(sender);
    return res ? res[0] : "";
  }

  public async isOperator(sender: string) {
    return (await this.isOperatorOf(sender)).length !== 0;
  }

  public async indexerCheck(address: string) {
    const senderStake = await this.fetchStake(address);

    if (!this.minStakeReq) {
      this.minStakeReq = await this.fetchMinStake();
    }
    if (senderStake < this.minStakeReq) {
      this.logger.warn(
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

  public inconsistentNonce(sender: string, topic: string, nonce: number) {
    // check message nonce from local states for consistency
    // TODO: remove return true if we decide to not drop first message)
    if (!(sender in this.nonceDirectory)) {
      this.nonceDirectory[sender] = { [topic]: nonce };
      // return true;
    } else if (!(topic in this.nonceDirectory[sender])) {
      this.nonceDirectory[sender][topic] = nonce;
      // return true;
    }

    const prevNonce: number = this.nonceDirectory[sender][topic];

    return prevNonce >= nonce;
  }

  public async disputeStatusCheck(address: string) {
    const senderDisputes = await this.fetchDisputes(address);
    //Note: a more relaxed check is if there's dispute with Undecided status
    return senderDisputes.reduce(
      (slashedRecord, dispute) =>
        slashedRecord + Number(formatUnits(dispute.tokensSlashed, 18)),
      0
    );
  }

  public async messageValidity(args: MessageValidityArgs) {
    const { sender, topic, nonce, blockHash, block } = args;

    // Resolve signer to indexer identity and check stake and dispute statuses
    const indexerAddress = await this.isOperatorOf(sender);
    if (!indexerAddress) {
      this.logger.warn(`👮 Sender not an operator, drop message`.red, {
        sender,
      });
      return 0;
    }

    const senderStake = await this.indexerCheck(indexerAddress);
    const tokensSlashed = await this.disputeStatusCheck(indexerAddress);
    if (senderStake == 0 || tokensSlashed > 0) {
      this.logger.warn(
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
      this.logger.warn(`👮 Invalid timestamp (nonce), drop message`, {
        nonce,
        blockHash,
        queriedBlock: block.hash,
      });
      return 0;
    }
    if (this.inconsistentNonce(sender, topic, nonce)) {
      this.logger.warn(
        `👮 Inconsistent nonce or first time sender, drop message`,
        {
          sender,
          topic,
          nonce,
        }
      );
      return 0;
    }
    return senderStake;
  }

  async fetchOperators(address: string): Promise<string[]> {
    try {
      const result = await this.registry
        .query(indexerOperatorQuery, { address })
        .toPromise();
      if (result.error) {
        throw result.error;
      }
      return result.data.indexer.account.gossipOperators;
    } catch (error) {
      this.logger.warn(`No operators fetched, assume none`, {
        error: error.message,
      });
      return [];
    }
  }

  async fetchOperatorOfIndexers(address: string) {
    try {
      const result = await this.registry
        .query(operatorOfIndexerQuery, { address })
        .toPromise();
      if (result.error) {
        throw result.error;
      }
      return result.data.graphAccount.gossipOperatorOf.map((account) => {
        return account.id;
      });
    } catch (error) {
      this.logger.warn(
        `Did not find corresponding indexer address for the gossip operator`,
        { error: error }
      );
      return null;
    }
  }

  async fetchStake(address: string) {
    try {
      const result = await this.networkSubgraph
        .query(indexerStakeQuery, { address })
        .toPromise();
      if (result.error) {
        throw result.error;
      }
      return Number(formatUnits(result.data.indexer.stakedTokens, 18));
    } catch (error) {
      this.logger.warn(`No stake fetched for indexer ${address}, assuming 0`, {
        error: error.message,
      });
      return 0;
    }
  }

  async fetchMinStake() {
    try {
      const result = await this.networkSubgraph
        .query(
          gql`
            {
              graphNetwork(id: "1") {
                minimumIndexerStake
              }
            }
          `
        )
        .toPromise();
      if (result.error) {
        throw result.error;
      }
      return Number(
        formatUnits(result.data.graphNetwork.minimumIndexerStake, 18)
      );
    } catch (error) {
      this.logger.warn(`Failed to fetch minimum indexer stake requirement`, {
        error: error.message,
      });
      return Number.POSITIVE_INFINITY;
    }
  }

  async fetchDisputes(address: string): Promise<Dispute[]> {
    try {
      const result = await this.networkSubgraph
        .query(disputeIndexerQuery, { address })
        .toPromise();
      if (result.error) {
        throw result.error;
      }
      return result.data.disputes;
    } catch (error) {
      this.logger.warn(
        `Failed to grab disputes, assume nothing (maybe assume something?)`,
        { error: error.message }
      );
      return [];
    }
  }
}
