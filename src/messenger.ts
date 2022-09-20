import { Waku, WakuMessage } from "js-waku";

//eslint-disable-next-line @typescript-eslint/no-var-requires
const protobuf = require("protobufjs");

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

  // TODO: Remove topic, pass Radio id or something like that
  async sendMessage(client, content, domain, types, block, topic) {
    const signature = await client.wallet._signTypedData(
      domain,
      types,
      content
    );

    const rawMessage = {
      content: content,
      nonce: Date.now(),
      blockNumber: block.number,
      blockHash: block.hash,
      signature,
    };
    console.log("✍️ Signing... " + signature);

    let protoMessage;
    protobuf.load("./proto/NPOIMessage.proto", async (err, root) => {
      if (err) {
        throw err;
      }
      protoMessage = root.lookupType("gossip.NPOIMessage");
    });

    const encodedMessage = protoMessage.encode(rawMessage).finish();
    const msg = await WakuMessage.fromBytes(encodedMessage, topic);

    await this.wakuInstance.relay.send(msg);

  }
}
