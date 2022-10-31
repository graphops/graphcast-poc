import { GraphcastMessage } from "../radio-common/graphcastMessage";
import { Waku, WakuMessage } from "js-waku";
import { ClientManager } from "./clientManager";
import { WriteMessageArgs } from "../radio-common/types";
import { Logger } from "@graphprotocol/common-ts";
export class Messenger {
  wakuInstance: Waku;
  clientManager: ClientManager;
  logger: Logger;

  init(parentLogger: Logger, waku: Waku, clients: ClientManager) {
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

      return message.encode();
    } catch (error) {
      throw Error(
        `Cannot write and encode the message, check formatting: ` + error
      );
    }
  }

  async sendMessage(
    encodedMessage: Uint8Array,
    topic: string,
    subtopic?: string
  ) {
    const constructedTopic = `/graphcast${
      process.env.TEST_ENVIRONMENT ? "-test" : ""
    }/0/${topic}/${subtopic ? subtopic + "/" : ""}proto`;

    const msg = await WakuMessage.fromBytes(encodedMessage, constructedTopic);
    await this.wakuInstance.relay.send(msg);
  }
}
