import bs58 from "bs58";
import "colors";
import * as protobuf from "protobufjs/light";

// POI topic configs, can probably be moved into POI message class
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
        `No attestations for $(subgraphDeployment) on block ${targetBlock} at the moment`
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

//Abstract the message to 3 layers
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

  private static Root = new Root().define("gossip").add(NPOIMessage.Type);
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
  
  //todo: auto-generate with types
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public static messageValues(subgraph: string, nPOI: string): any {
    return {
      subgraph,
      nPOI,
    };
  }
}
