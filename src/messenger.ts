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

  async sendMessage(payload: string, contentTopic: string) {
    const msg = await WakuMessage.fromUtf8String(
      payload,
      contentTopic,
    );

    await this.wakuInstance.relay.send(msg);
  }
}
