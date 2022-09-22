import { GraphcastMessage } from "./graphcastMessage";
import { Waku, WakuMessage } from "js-waku";
import { ClientManager } from "./ethClient";
import { BlockPointer } from "./types";
export class Messenger {
  wakuInstance: Waku;
  clientManager: ClientManager;

  async init(clients: ClientManager) {
    const waku = await Waku.create({
      bootstrap: {
        default: true,
      },
    });

    this.wakuInstance = waku;
    this.clientManager = clients;
  }

  async writeMessage(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    radioPayload: any,
    types: { name: string; type: string }[],
    block: BlockPointer
  ) {
    try {
      const signature =
        await this.clientManager.ethClient.wallet._signTypedData(
          GraphcastMessage.domain,
          { GraphcastMessage: types },
          radioPayload
        );

      console.log("✍️ Signing... " + signature);

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
