import { NPOIMessage } from "./examples/poi-crosschecker/utils";
import { Waku, WakuMessage } from "js-waku";
import { ClientManager } from "./ethClient";
import { BlockPointer } from "./radio-common/types";
export class Messenger {
  wakuInstance: Waku;
  clientManager: ClientManager;

  async init(clients: ClientManager) {
    const waku = await Waku.create({
      bootstrap: {
        default: true,
      },
    });

    // await waku.waitForRemotePeer();
    this.wakuInstance = waku;
    this.clientManager = clients;
  }

  async writeMessage(
    messageTyping: typeof NPOIMessage,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    rawMessage: any,
    block: BlockPointer
  ) {
    try {
      const signature = await this.clientManager.ethClient.wallet._signTypedData(
        messageTyping.domain,
        messageTyping.types,
        rawMessage
      );

      console.log("✍️ Signing... " + signature);
      //TODO: abstract NPOIMessage
      const message = new messageTyping({
        subgraph: rawMessage.subgraph,
        nPOI: rawMessage.nPOI,
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
