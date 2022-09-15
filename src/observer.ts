import { ClientManager } from "./ethClient";
import { ethers } from "ethers";
import { Waku } from "js-waku";
import { WakuMessage } from "js-waku/build/main/lib/waku_message/index";
import {
  Attestation,
} from "./examples/poi-crosschecker/poi-helpers";
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
  readMessage(msg: Uint8Array, MessageType: any) {
    try {
      return MessageType.decode(msg).payload;
    } catch (error) {
      console.error(`Protobuf could not decode message, check formatting`);
      return;
    }
  }

  // maybe include radioFilter as observer property
  async prepareAttestation(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    message: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    MessageType: any
  ): Promise<Attestation> {
    //TODO: extract subgraph and nPOI based on provided typing
    const { subgraph, nPOI, nonce, blockNumber, blockHash, signature } =
      message;
    const value = MessageType.messageValues(subgraph, nPOI);
    const hash = ethers.utils._TypedDataEncoder.hash(
      MessageType.domain,
      MessageType.types,
      value
    );
    const sender = ethers.utils.recoverAddress(hash, signature).toLowerCase();

    // Message Validity (check registry identity, time, stake, dispute) for which to skip by returning early
    const block = await provider.getBlock(Number(blockNumber));
    const stake = await radioFilter.poiMsgValidity(
      registryClient,
      sender,
      subgraph,
      Number(nonce),
      blockHash,
      block
    );
    if (stake <= 0) {
      return;
    }

    console.info(
      `\n✅ Valid message!\nSender: ${sender}\nNonce(unix): ${nonce}\nBlock: ${blockNumber}\nSubgraph (ipfs hash): ${subgraph}\nnPOI: ${nPOI}\n\n`
        .green
    );

    // can be built outside or using types
    const attestation: Attestation = {
      nPOI,
      deployment: subgraph,
      blockNumber: Number(blockNumber),
      indexerAddress: sender,
      stake: BigInt(stake),
    };

    return attestation;
  }
}
