import { Waku } from "js-waku";

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

  observe(contentTopic: string, handler: () => void): void {
    this.wakuInstance.relay.addObserver(
      handler,
      [contentTopic],
    );
  }
}
