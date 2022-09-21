import { ClientManager } from "./ethClient";
import { Waku } from "js-waku";
import { WakuMessage } from "js-waku/build/main/lib/waku_message/index";
import RadioFilter from "./radio-common/customs";

export class Observer {
  wakuInstance: Waku;
  radioFilter: RadioFilter;
  clientManager: ClientManager;

  async init(clients: ClientManager) {
    const waku = await Waku.create({
      bootstrap: {
        default: true,
      },
    });

    await waku.waitForRemotePeer();
    this.wakuInstance = waku;

    this.radioFilter = new RadioFilter();
    this.clientManager = clients;
  }

  observe(topics: string[], handler: (msg: Uint8Array) => void): void {
    this.wakuInstance.relay.addObserver((msg: WakuMessage) => {
      handler(msg.payload);
    }, topics);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readMessage(
    msg: Uint8Array,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MessageType: any,
    radioPayloadTypes: Array<{
      name: string;
      type: string;
    }>
  ) {
    try {
      return MessageType.decode(msg, radioPayloadTypes).payload;
    } catch (error) {
      console.error(`Protobuf could not decode message, check formatting`);
      return;
    }
  }
}
