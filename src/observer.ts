import { Waku, WakuMessage } from "js-waku";

// type GossipMessage = {
//   payload: string,
// };

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

  observe(contentTopic: string, cb: (message: WakuMessage) => void): void {
    this.wakuInstance.relay.addObserver(
      cb,
      [contentTopic],
    );
  }
}
