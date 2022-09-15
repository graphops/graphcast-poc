import { NPOIMessage } from './examples/poi-crosschecker/poi-helpers';
import { Waku, WakuMessage } from "js-waku";
export class Messenger {
  wakuInstance: Waku;

  async init() {
    const waku = await Waku.create({
      bootstrap: {
        default: true,
      },
    });

    await waku.waitForRemotePeer();
    this.wakuInstance = waku;
  }

  async writeMessage(client, rawMessage, domain, types, block){
    try {
      const signature = await client.wallet._signTypedData(
        domain,
        types,
        rawMessage
      );

      console.log("✍️ Signing... " + signature);
      //TODO: abstract NPOIMessage
      const message = new NPOIMessage({
        subgraph: rawMessage.subgraph,
        nPOI: rawMessage.nPOI,
        nonce: Date.now(),
        blockNumber: block.number,
        blockHash: block.hash, 
        signature: signature,
      });

      const encodedMessage = message.encode()
      return encodedMessage
    } catch (error) {
      throw Error(`Cannot write and encode the message, check formatting\n` + error)
    }
  }

  async sendMessage(encodedMessage: Uint8Array, topic: string) {
    const msg = await WakuMessage.fromBytes(encodedMessage, topic);
    await this.wakuInstance.relay.send(msg);
  }
}
