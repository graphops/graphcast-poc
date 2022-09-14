import { ethers } from "ethers";
import { Waku } from "js-waku";
import { WakuMessage } from "js-waku/build/main/lib/waku_message/index";
import { Attestation } from "./examples/poi-crosschecker/poi-helpers";

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

  // maybe radioFilter belong to the observer class
  async prepareAttestation(Message, msg, domain, types, messageValue, provider, radioFilter, registryClient){
    let message;
      try {
        const decodedMessage = Message.decode(msg);

        message = Message.toObject(decodedMessage, {
          subgraph: String,
          nPOI: String,
          nonce: Number,
          blockNumber: Number,
          blockHash: String,
          signature: String,
        });
      } catch (error) {
        console.error(
          `Protobuf reader could not decode message, assume corrupted`
        );
        return;
      }

      // extract subgraph and nPOI based on provided types - for now use a defined 
      // messageValue
      const {
        subgraph,
        nPOI,
        nonce,
        blockNumber,
        blockHash,
        signature,
      } = message;

      const value = messageValue(subgraph, nPOI)
      const hash = ethers.utils._TypedDataEncoder.hash(domain, types, value);
      const sender = ethers.utils
        .recoverAddress(hash, signature)
        .toLowerCase();

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
      
      return attestation
  }
}
