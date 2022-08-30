import { getPublicKey, Waku } from "js-waku";
import { WakuMessage } from "js-waku/build/main/lib/waku_message/index";
import bytes32 from "bytes32";
// import { NPOIMessage } from "./examples/poi-crosschecker/proto/NPOIMessage/gossip"
// eslint-disable-next-line @typescript-eslint/no-var-requires
const protobuf = require("protobufjs");

export class Observer {
  wakuInstance: Waku;

  async init(ethClient, key) {
    const waku = await Waku.create({
      bootstrap: {
        default: true,
      },
      // decryptionKeys: [bytes32({ input: "donut" })],
    });

    waku.addDecryptionKey(key);
    await waku.waitForRemotePeer();
    this.wakuInstance = waku;
  }

  observe(topics: string[], handler: (msg: any) => void): void {
    this.wakuInstance.relay.addObserver((msg: WakuMessage) => {
      console.log("MESSAGE " + msg.payload);

      if (!msg || !msg.payload || msg.payload.length === 0) {
        console.log("Empty message!");
        return;
      }

      console.log("Msg received! Handling... 10");

      console.log("bytes " + msg.payload);

      protobuf.load("./proto/NPOIMessage.proto", async (err, root) => {
        if (err) {
          throw err;
        }

        let message;
        try {
          console.log("Decoding...");
          const Message = root.lookupType("gossip.NPOIMessage");
          const decodedMessage = Message.decode(msg);

          console.log("decodedMessage " + decodedMessage);

          message = Message.toObject(decodedMessage, {
            timestamp: Number,
            blockNumber: Number,
            subgraph: String,
            nPOI: String,
            sender: String,
          });

          handler(message);
        } catch (error) {
          console.log(error);
          console.error(
            `Protobuf reader could not decode message, assume corrupted`
          );
          return;
        }
      });
    }, topics);
  }
}
