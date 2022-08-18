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

  async sendMessage(encodedMessage: Uint8Array, topic: string) {
    const msg = await WakuMessage.fromBytes(encodedMessage, topic);

    await this.wakuInstance.relay.send(msg);
  }
}
