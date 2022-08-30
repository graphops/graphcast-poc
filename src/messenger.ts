import { Waku, WakuMessage } from "js-waku";
import bytes32 from "bytes32";
import { getPublicKey } from "js-waku";
import { generateSymmetricKey } from "js-waku";

export class Messenger {
  wakuInstance: Waku;
  key;
  async init(key) {
    const waku = await Waku.create({
      bootstrap: {
        default: true,
      },
      decryptionKeys: [key],
    });
    this.key = key;

    waku.addDecryptionKey(key);
    await waku.waitForRemotePeer();
    this.wakuInstance = waku;
  }

  async sendMessage(encodedMessage: Uint8Array, topic: string) {
    //const symKey = decode(encode(topic));
    // const publicKey = getPublicKey(
    //   Uint8Array.from(
    //     bytes32({ input: process.env.RADIO_OPERATOR_PRIVATE_KEY })
    //   )
    // );

    //const symmetricKey = generateSymmetricKey();
    // const enc = new TextEncoder();

    //console.log(symKey);

    const msg = await WakuMessage.fromUtf8String("hello i am a message", topic, {symKey: this.key});

    await this.wakuInstance.relay.send(msg);
  }
}
