import { GraphcastMessage } from "./graphcastMessage";
import { Waku, WakuMessage } from "js-waku";
import { ClientManager } from "./ethClient";
import { WriteMessageArgs } from "./types";
import { Logger } from "@graphprotocol/common-ts";
export class Messenger {
  wakuInstance: Waku;
  clientManager: ClientManager;
  logger: Logger;

  async init(parentLogger: Logger, waku: Waku, clients: ClientManager) {
    this.logger = parentLogger.child({
      component: "Messenger",
    });

    this.wakuInstance = waku;
    this.clientManager = clients;
  }

  async writeMessage(args: WriteMessageArgs) {
    const { radioPayload, types, block } = args;

    try {
      const signature =
        await this.clientManager.ethClient.wallet._signTypedData(
          GraphcastMessage.domain,
          { GraphcastMessage: types },
          radioPayload
        );

      this.logger.debug("✍️ Signing... " + signature);

      const message = new GraphcastMessage({
        radioPayload: JSON.stringify(radioPayload),
        nonce: Date.now(),
        blockNumber: block.number,
        blockHash: block.hash,
        signature: signature,
      });

      const encodedMessage = message.encode();

      return encodedMessage;
    } catch (error) {
      throw Error(
        `Cannot write and encode the message, check formatting\n` + error
      );
    }
  }

  async sendMessage(encodedMessage: Uint8Array, topic: string) {
    const msg = await WakuMessage.fromBytes(encodedMessage, topic);
    await this.wakuInstance.relay.send(msg);
  }
}
