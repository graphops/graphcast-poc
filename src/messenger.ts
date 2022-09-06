import { Waku, WakuMessage } from "js-waku";

export class Messenger {
  wakuInstance: Waku;
  nonce: number;

  async init() {
    const waku = await Waku.create({
      bootstrap: {
        default: true,
      },
    });

    // await waku.waitForRemotePeer();
    this.wakuInstance = waku;
    this.nonce = 0;
  }

  async sendMessage(encodedMessage: Uint8Array, topic: string) {
    // move populate and encode message here
    const msg = await WakuMessage.fromBytes(encodedMessage, topic);

    await this.wakuInstance.relay.send(msg);
    this.nonce += 1;
  }
}
