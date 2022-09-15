import { ethers } from "ethers";
import { Waku } from "js-waku";
import { WakuMessage } from "js-waku/build/main/lib/waku_message/index";
import { Attestation, NPOIMessage, NPOIMessagePayload } from "./examples/poi-crosschecker/poi-helpers";

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

  //TODO: pass in the NPOI typings
  readMessage(msg: Uint8Array){
    try {
      return NPOIMessage.decode(msg).payload as NPOIMessagePayload
    } catch (error) {
      console.error(
        `Protobuf could not decode message, check formatting`
      );
      return;
    }
  }

  // maybe include radioFilter as observer property
  async prepareAttestation(message, domain, types, messageValue, provider, radioFilter, registryClient){
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
