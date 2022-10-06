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

      console.log("🔎 All nPOIs:");
      console.log(rows);
      
      const localNPOIs = rows.filter((record) => record.operator === operator);

      console.log("🔎 Local nPOIs:");
      console.log(localNPOIs);

      if (localNPOIs.length > 0) {
        localNPOIs.forEach((record) => {
          const { subgraph, nPOI } = record;

          // This check should include excluding our own attestations, but leaving it for now for ease of testing
          const remoteNPOIs = rows.filter(
            (record) => record.subgraph === subgraph
          );

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
            indexerAddresses: topAttestation.operators,
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

//TODO: modify attestation types
export const sortAttestations = (records: NPOIRecord[]) => {
  const groups = [];
  records.forEach((record: NPOIRecord) => {
    // if match with group's nPOI, update that group
    const matchedGroup = groups.find((g) => g.nPOI === record.nPOI);
    if (matchedGroup) {
      matchedGroup.stakeWeight += record.stakeWeight;
      matchedGroup.operators.push(record.operator);
    } else {
      groups.push({
        nPOI: record.nPOI,
        stakeWeight: record.stakeWeight,
        operators: [record.operator],
      });
    }
  });

  const sorted = groups.sort((a, b) => Number(b.stakeWeight - a.stakeWeight));
  return sorted;
};
