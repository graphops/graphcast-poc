import { EthClient } from './ethClient';
import { Waku, WakuMessage } from "js-waku";

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

  async writeMessage(client, Message, rawMessage, domain, types, block){
    const signature = await client.wallet._signTypedData(
      domain,
      types,
      rawMessage
    );

    const message = {
      ...rawMessage,
      nonce: Date.now(),
      blockNumber: block.number,
      blockHash: block.hash,
      signature,
    };
    console.log("✍️ Signing... " + signature);

    const encodedMessage = Message.encode(message).finish();
    return encodedMessage
  }

  async sendMessage(encodedMessage: Uint8Array, topic: string) {
    // move populate and encode message here
    const msg = await WakuMessage.fromBytes(encodedMessage, topic);

    await this.wakuInstance.relay.send(msg);
  }
}
