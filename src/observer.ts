import { ClientManager } from "./ethClient";
import { Waku } from "js-waku";
import { WakuMessage } from "js-waku/build/main/lib/waku_message/index";
import RadioFilter from "./radio-common/customs";
import { ethers } from "ethers";
import { GraphcastMessage } from "./graphcastMessage";
import { ReadMessageArgs } from "./types";

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

  observe(
    topics: string[],
    handler: (msg: Uint8Array, topic: string) => void
  ): void {
    this.wakuInstance.relay.addObserver((msg: WakuMessage) => {
      handler(msg.payload, msg.contentTopic);
    }, topics);
  }

  _decodeMessage(
    msg: Uint8Array,
    types: Array<{
      name: string;
      type: string;
    }>
  ) {
    return GraphcastMessage.decode(msg).payload;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async readMessage(args: ReadMessageArgs) {
    const { msg, topic, types } = args;

    try {
      const message = this._decodeMessage(msg, types);

      const { radioPayload, nonce, blockNumber, blockHash, signature } =
        message;

      const hash = ethers.utils._TypedDataEncoder.hash(
        GraphcastMessage.domain,
        { GraphcastMessage: types },
        JSON.parse(radioPayload)
      );

      const sender = ethers.utils.recoverAddress(hash, signature).toLowerCase();

      const block = await this.clientManager.ethClient.buildBlock(
        Number(blockNumber)
      );

      const stakeWeight = await this.radioFilter.messageValidity({
        client: this.clientManager.registry,
        sender,
        topic,
        nonce: Number(nonce),
        blockHash,
        block,
      });
      if (stakeWeight <= 0) {
        return;
      }

      console.info(
        `\n✅ Valid message!\nSender: ${sender}\nNonce(unix): ${nonce}\nBlock: ${blockNumber}`
          .green
      );

      return {
        radioPayload,
        blockNumber,
        sender,
        stakeWeight,
      };
    } catch (error) {
      console.error(`Protobuf could not decode message, check formatting`);
      return;
    }
  }
}
