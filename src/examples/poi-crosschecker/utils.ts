import bs58 from "bs58";
import "colors";
import { NPOIRecord } from "./types";

export const defaultModel = "default => 100000;";

export const processAttestations = (
  targetBlock: number,
  operator: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
) => {
  const divergedDeployments: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.all(
    "SELECT subgraph, block, nPOI, operator, stake_weight as stakeWeight FROM npois WHERE block = ?",
    targetBlock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, rows: NPOIRecord[]) => {
      if (err) {
        console.log(`An error occurred: ${err.message}`);
      }

      const localNPOIs = rows.filter((record) => record.operator === operator);

      console.log("🔎 Local nPOIs:");
      console.log(localNPOIs);

      if (localNPOIs.length > 0) {
        localNPOIs.forEach((record) => {
          const { subgraph, nPOI } = record;

          // This check should include excluding our own attestations, but leaving it for now for ease of testing
          const remoteNPOIs = localNPOIs.filter(
            (record) => record.subgraph === subgraph
          );

          console.log("🔎 Remote nPOIs:");
          console.log(remoteNPOIs);

          if (remoteNPOIs === undefined || remoteNPOIs.length === 0) {
            console.debug(
              `No remote attestations for ${subgraph} on block ${targetBlock} at the moment.`
            );
            return [];
          }

          const topAttestation = sortAttestations(remoteNPOIs)[0];
          console.log(`📒 Attestation check`.blue, {
            subgraph,
            block: targetBlock,
            remoteNPOIs,
            mostStaked: topAttestation.nPOI,
            indexerAddresses: topAttestation.indexers,
            nPOI,
          });

          if (topAttestation.nPOI === nPOI) {
            console.debug(
              `✅ POIs match for subgraphDeployment ${subgraph} on block ${targetBlock}.`
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
              Buffer.from(bs58.decode(subgraph))
                .toString("hex")
                .replace("1220", "0x")
            );
          }
        });
      }
    }
  );
  return divergedDeployments;
};

export const printNPOIs = (nPOIs: Map<string, Map<string, NPOIRecord[]>>) => {
  if (nPOIs.size === 0) {
    console.log("😔 State is empty.".blue);
  }
  nPOIs.forEach((blocks, subgraph) => {
    console.debug(`\n📝 Printing nPOIs for subgraph ${subgraph}:`.blue);
    blocks.forEach((attestations, block) => {
      console.log(`🔍  Attestations for block ${block}:`.cyan);
      attestations.forEach((a) => {
        console.log(
          `nPOI: ${a.nPOI}\nSender: ${a.operator}\nStake:${a.stakeWeight}\n`
            .cyan
        );
      });
    });
  });
};

//TODO: modify attestation types
export const sortAttestations = (records: NPOIRecord[]) => {
  const groups = [];
  records.forEach((record: NPOIRecord) => {
    // if match with group's nPOI, update that group
    const matchedGroup = groups.find((g) => g.nPOI === record.nPOI);
    if (matchedGroup) {
      matchedGroup.stakeWeight += record.stakeWeight;
      matchedGroup.indexers.push(record.operator);
    } else {
      groups.push({
        nPOI: record.nPOI,
        stakeWeight: record.stakeWeight,
        indexers: [record.operator],
      });
    }
  });

  const sorted = groups.sort((a, b) => Number(a.stakeWeight - b.stakeWeight));
  return sorted;
};
