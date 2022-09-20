import bs58 from "bs58";
import "colors";
import * as protobuf from "protobufjs/light";
import { Client } from "@urql/core";
import { fetchDisputes } from "./queries";
import { Block } from "@ethersproject/providers";
import RadioFilter from "../../radio-common/customs";
import { ethers } from "ethers";

export type Attestation = {
  nPOI: string;
  deployment: string;
  blockNumber: number;
  indexerAddress: string;
  stake: bigint;
};

export const defaultModel = "default => 100000;";

export function processAttestations(localnPOIs, nPOIs, targetBlock) {
  const divergedDeployments: string[] = [];
  localnPOIs.forEach((blocks, subgraphDeployment) => {
    if (
      !nPOIs.has(subgraphDeployment) ||
      !nPOIs.get(subgraphDeployment).has(targetBlock)
    ) {
      console.debug(
        `No attestations for ${subgraphDeployment} on block ${targetBlock} at the moment`
      );
      return [];
    }

    const localNPOI = blocks.get(targetBlock);
    const attestations = nPOIs.get(subgraphDeployment).get(targetBlock);

    const topAttestation = sortAttestations(attestations)[0];
    console.log(`📒 Attestation check`.blue, {
      subgraphDeployment,
      block: targetBlock,
      attestations,
      mostStaked: topAttestation.nPOI,
      localNPOI,
    });

    if (topAttestation.nPOI === localNPOI) {
      console.debug(
        `✅ POIs match for subgraphDeployment ${subgraphDeployment} on block ${targetBlock}.`
          .green
      );
    } else {
      //Q: is expensive query definitely the way to go? what if attacker purchase a few of these queries, could it lead to dispute?
      //But I guess they cannot specifically buy as queries go through ISA
      console.warn(
        `❌ POIS do not match, updating cost model to block off incoming queries`
          .red
      );
      // Cost model schema used byte32 representation of the deployment hash
      divergedDeployments.push(
        Buffer.from(bs58.decode(subgraphDeployment))
          .toString("hex")
          .replace("1220", "0x")
      );
    }
  });
  return divergedDeployments;
}

export const printNPOIs = (nPOIs: Map<string, Map<string, Attestation[]>>) => {
  if (nPOIs.size === 0) {
    console.log("😔 State is empty.".blue);
  }
  nPOIs.forEach((blocks, subgraph) => {
    console.debug(`\n📝 Printing nPOIs for subgraph ${subgraph}:`.blue);
    blocks.forEach((attestations, block) => {
      console.log(`🔍  Attestations for block ${block}:`.cyan);
      attestations.forEach((a) => {
        console.log(
          `nPOI: ${a.nPOI}\nSender: ${a.indexerAddress}\nStake:${a.stake}\n`
            .cyan
        );
      });
    });
  });
};

export const sortAttestations = (attestations: Attestation[]) =>
  attestations.sort((a, b) => {
    if (a.stake < b.stake) {
      return 1;
    } else if (a.stake > b.stake) {
      return -1;
    } else {
      return 0;
    }
  });

export const storeAttestations = (nPOIs, attestation) => {
  const deployment = attestation.deployment;
  const blockNum = attestation.blockNumber.toString();
  if (nPOIs.has(deployment)) {
    const blocks = nPOIs.get(attestation.deployment);
    if (blocks.has(blockNum)) {
      const attestations = [...blocks.get(blockNum), attestation];
      blocks.set(blockNum, attestations);
    } else {
      blocks.set(blockNum, [attestation]);
    }
  } else {
    nPOIs.set(deployment, new Map([[blockNum, [attestation]]]));
  }
};

const Root = protobuf.Root,
  Type = protobuf.Type,
  Field = protobuf.Field;

export interface NPOIMessagePayload {
  subgraph: string;
  nPOI: string;
  nonce: number;
  blockNumber: number;
  blockHash: string;
  signature: string;
}

export class NPOIMessage {
  private static Type = new Type("NPOIMessage")
    .add(new Field("subgraph", 1, "string"))
    .add(new Field("nPOI", 2, "string"))
    // These can be removed or factored to a general message type
    .add(new Field("nonce", 3, "int64"))
    .add(new Field("blockNumber", 4, "int64"))
    .add(new Field("blockHash", 5, "string"))
    .add(new Field("signature", 6, "string"));

  // private static Root = new Root().define("gossip").add(NPOIMessage.Type);
  public static domain = {
    name: `graphcast-poi-crosschecker`,
    version: "0",
  };
  public static types = {
    NPOIMessage: [
      { name: "subgraph", type: "string" },
      { name: "nPOI", type: "string" },
    ],
  };

  constructor(public payload: NPOIMessagePayload) {}

  public encode(): Uint8Array {
    const message = NPOIMessage.Type.create(this.payload);
    return NPOIMessage.Type.encode(message).finish();
  }

  public static decode(bytes: Uint8Array | Buffer): NPOIMessage | undefined {
    const payload = NPOIMessage.Type.decode(
      bytes
    ) as unknown as NPOIMessagePayload;
    if (!payload.subgraph || !payload.nPOI) {
      console.log(
        "Field (subgraph and nPOI) missing on decoded NPOIMessage",
        payload
      );
      return;
    }
    return new NPOIMessage(payload);
  }

  get nPOI(): string {
    return this.payload.nPOI;
  }

  public static messageValues(
    subgraph: string,
    nPOI: string
  ): { subgraph: string; nPOI: string } {
    return {
      subgraph,
      nPOI,
    };
  }
}

export const disputeStatusCheck = async (client: Client, address: string) => {
  const senderDisputes = await fetchDisputes(client, address);
  //Note: a more relaxed check is if there's dispute with Undecided status
  return senderDisputes.reduce(
    (slashedRecord, dispute) => slashedRecord + Number(dispute.tokensSlashed),
    0
  );
};

// TODO: Move this into the poi example
export const poiMsgValidity = async (
  client: Client,
  sender: string,
  deployment: string,
  nonce: number,
  blockHash: string,
  block: Block
) => {
  const radioFilter = new RadioFilter();

  // Resolve signer to indexer identity and check stake and dispute statuses
  const indexerAddress = await radioFilter.isOperatorOf(client, sender);
  if (!indexerAddress) {
    console.warn(`👮 Sender not an operator, drop message`.red, { sender });
    return 0;
  }

  const senderStake = await radioFilter.indexerCheck(client, indexerAddress);
  const tokensSlashed = await disputeStatusCheck(client, indexerAddress);
  if (senderStake == 0 || tokensSlashed > 0) {
    console.warn(
      `👮 Indexer identity failed stake requirement or has been slashed, drop message`
        .red,
      {
        senderStake,
        tokensSlashed,
      }
    );
    return 0;
  }

  // Message param checks
  if (await radioFilter.replayCheck(nonce, blockHash, block)) {
    console.warn(`👮 Invalid timestamp (nonce), drop message`.red, {
      nonce,
      blockHash,
      queriedBlock: block.hash,
    });
    return 0;
  }
  if (radioFilter.inconsistentNonce(sender, deployment, nonce)) {
    console.warn(
      `👮 Inconsistent nonce or first time sender, drop message`.red,
      {
        sender,
        deployment,
        nonce,
      }
    );
    return 0;
  }
  return senderStake;
};

// TODO: Remove from here
// maybe include radioFilter as observer property
export const prepareAttestation = async (
  message: any,
  NPOIMessage: any,
  provider: ethers.providers.JsonRpcProvider,
  registryClient: Client
) => {
  // extract subgraph and nPOI based on provided types - for now use a defined
  // messageValues
  const { subgraph, nPOI, nonce, blockNumber, blockHash, signature } = message;

  const value = NPOIMessage.messageValues(subgraph, nPOI);
  const hash = ethers.utils._TypedDataEncoder.hash(
    NPOIMessage.domain,
    NPOIMessage.types,
    value
  );
  const sender = ethers.utils.recoverAddress(hash, signature).toLowerCase();

  // Message Validity (check registry identity, time, stake, dispute) for which to skip by returning early
  const block = await provider.getBlock(Number(blockNumber));
  const stake = await poiMsgValidity(
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
};
