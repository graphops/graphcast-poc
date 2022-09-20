import { NPOIMessage } from "./examples/poi-crosschecker/utils";
import { Waku, WakuMessage } from "js-waku";
import { Block } from "@ethersproject/abstract-provider";
import { EthClient } from "./ethClient";
export class Messenger {
  wakuInstance: Waku;

  async init() {
    const waku = await Waku.create({
      bootstrap: {
        default: true,
      },
    });

    // await waku.waitForRemotePeer();
    this.wakuInstance = waku;
  }

  async writeMessage(
    client: EthClient,
    messageTyping: typeof NPOIMessage,
    rawMessage: { subgraph: string; nPOI: string },
    block: Block
  ) {
    try {
      const signature = await client.wallet._signTypedData(
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
