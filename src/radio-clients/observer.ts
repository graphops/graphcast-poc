import { ClientManager } from "./clientManager";
import { Waku } from "js-waku";
import { WakuMessage } from "js-waku/build/main/lib/waku_message/index";
import RadioFilter from "../radio-common/customs";
import { ethers } from "ethers";
import { GraphcastMessage } from "../radio-common/graphcastMessage";
import { ReadMessageArgs } from "../radio-common/types";
import { Logger } from "@graphprotocol/common-ts";

export class Observer {
  wakuInstance: Waku;
  clientManager: ClientManager;
  logger: Logger;

  async init(parentLogger: Logger, waku: Waku, clients: ClientManager) {
    this.logger = parentLogger.child({
      component: "Observer",
    });

    await waku.waitForRemotePeer();
    this.wakuInstance = waku;
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
    const { msg, types } = args;

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

      return {
        radioPayload,
        nonce,
        blockNumber,
        blockHash,
        sender,
      };
    } catch (error) {
      this.logger.error(`Failed to read and validate message`, {
        error: error.message,
      });
      return;
    }
  }
}
