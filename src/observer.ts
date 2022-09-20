import { Waku } from "js-waku";
import { WakuMessage } from "js-waku/build/main/lib/waku_message/index";
import { NPOIMessage } from "./examples/poi-crosschecker/utils";

export class Observer {
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

  observe(topics: string[], handler: (msg: Uint8Array) => void): void {
    this.wakuInstance.relay.addObserver((msg: WakuMessage) => {
      handler(msg.payload);
    }, topics);
  }

  readMessage(msg: Uint8Array, messageType: typeof NPOIMessage) {
    try {
      return messageType.decode(msg).payload;
    } catch (error) {
      console.error(`Protobuf could not decode message, check formatting`);
      return;
    }
  }
}
