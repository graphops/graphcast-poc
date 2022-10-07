import { ClientManager } from "./ethClient";
import { Waku } from "js-waku";
import { WakuMessage } from "js-waku/build/main/lib/waku_message/index";
import RadioFilter from "./radio-common/customs";
import { ethers } from "ethers";
import { GraphcastMessage } from "./graphcastMessage";
import { ReadMessageArgs } from "./types";
import { Logger, createLogger } from "@graphprotocol/common-ts";

export class Observer {
  wakuInstance: Waku;
  radioFilter: RadioFilter;
  clientManager: ClientManager;
  logger: Logger;

  async init(parentLogger: Logger, waku: Waku, clients: ClientManager) {
    this.logger = parentLogger.child({
      component: "Observer",
    });

    await waku.waitForRemotePeer();
    this.wakuInstance = waku;
    this.radioFilter = new RadioFilter(this.logger);
    this.clientManager = clients;
  }

  observe(
    topics: string[],
    handler: (msg: Uint8Array, topic: string) => void
  ): void {
    this.wakuInstance.relay.addObserver((msg: WakuMessage) => {
      handler(msg.payload, msg.contentTopic);
    }, topics);
  }

  _decodeMessage(
    msg: Uint8Array,
    types: Array<{
      name: string;
      type: string;
    }>
  ) {
    return GraphcastMessage.decode(msg).payload;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async readMessage(args: ReadMessageArgs) {
    const { msg, topic, types } = args;

    try {
      const message = this._decodeMessage(msg, types);

      const { radioPayload, nonce, blockNumber, blockHash, signature } =
        message;

      const hash = ethers.utils._TypedDataEncoder.hash(
        GraphcastMessage.domain,
        { GraphcastMessage: types },
        JSON.parse(radioPayload)
      );

      const sender = ethers.utils.recoverAddress(hash, signature).toLowerCase();

      const block = await this.clientManager.ethClient.buildBlock(
        Number(blockNumber)
      );

      const stakeWeight = await this.radioFilter.messageValidity({
        registry: this.clientManager.registry,
        graphNetwork: this.clientManager.networkSubgraph,
        sender,
        topic,
        nonce: Number(nonce),
        blockHash,
        block,
      });
      if (stakeWeight <= 0) {
        return;
      }

      this.logger.info(
        `\n✅ Valid message!\nSender: ${sender}\nNonce(unix): ${nonce}\nBlock: ${blockNumber}`
      );

      return {
        radioPayload,
        blockNumber,
        sender,
        stakeWeight,
      };
    } catch (error) {
      this.logger.error(`Failed to read and validate message`, {
        error: error.message,
      });
      return;
    }
  }
}
