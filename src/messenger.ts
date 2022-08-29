import { Waku, WakuMessage } from "js-waku";
import bytes32 from "bytes32";
import { encode, decode } from "js-base64";
import { getPublicKey } from "js-waku";

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
    //const symKey = decode(encode(topic));
    const publicKey = getPublicKey(
      Uint8Array.from(
        bytes32({ input: process.env.RADIO_OPERATOR_PRIVATE_KEY })
      )
    );

    //console.log(symKey);

    const msg = await WakuMessage.fromBytes(encodedMessage, topic, {
      encPublicKey: publicKey,
      sigPrivKey: Uint8Array.from(
        bytes32({ input: process.env.RADIO_OPERATOR_PRIVATE_KEY })
      ),
    });

    await this.wakuInstance.relay.send(msg);
  }
}
