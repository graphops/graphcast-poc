import { Waku } from "js-waku";
import { WakuMessage } from "js-waku/build/main/proto/waku/v2/message";

export class Observer {
  wakuInstance: Waku;

  async init() {
    const waku = await Waku.create({
      bootstrap: {
        default: true,
      }
    });

    await waku.waitForRemotePeer();
    this.wakuInstance = waku;
  }

  observe(contentTopic: string, handler: (msg: Uint8Array) => void): void {
    this.wakuInstance.relay.addObserver(
      (msg: WakuMessage) => {
        handler(msg.payload);
      },
      [`/graph-gossip/0/${contentTopic}/proto`],
    );
  }
}
