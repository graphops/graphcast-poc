import bs58 from "bs58";
import "colors";
import { NPOIRecord } from "./types";
import { Logger } from "@graphprotocol/common-ts";

/* eslint-disable @typescript-eslint/no-var-requires */
const sqlite3 = require("sqlite3").verbose();

export const defaultModel = "default => 100000;";

// TODO: update operator field in db to indexer
export const processAttestations = (
  logger: Logger,
  targetBlock: number,
  operator: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any
): string[] => {
  const divergedDeployments: string[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db.all(
    `SELECT subgraph, block, nPOI, operator, stake_weight as stakeWeight FROM ${TABLE_NAME} WHERE block = ?`,
    targetBlock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, rows: NPOIRecord[]) => {
      if (err) {
        logger.error(`An error occurred: ${err.message}`);
      }

      const localNPOIs = rows.filter((record) => record.operator === operator);

      logger.debug("🔎 POIs", { localNPOIs, allnPOIs: rows, targetBlock });

      localNPOIs.forEach((record) => {
        const attestedNPOIs = rows.filter(
          (attested) => attested.subgraph === record.subgraph
        );

        if (attestedNPOIs === undefined || attestedNPOIs.length === 0) {
          logger.debug(
            `No remote attestations for ${record.subgraph} on block ${targetBlock} at the moment.`
          );
          return [];
        }

        const topAttestation = sortAttestations(attestedNPOIs)[0];
        logger.info(`📒 Attestation check`, {
          subgraph: record.subgraph,
          block: targetBlock,
          attestedNPOIs,
          mostStaked: topAttestation.nPOI,
          indexerAddresses: topAttestation.operators,
          nPOI: record.nPOI,
        });

        if (topAttestation.nPOI === record.nPOI) {
          logger.debug(
            `✅ POIs match for subgraphDeployment ${record.subgraph} on block ${targetBlock}.`
          );
        } else {
          logger.warn(
            `❌ POIS do not match, updating cost model to block off incoming queries`
          );
          // Cost model schema used byte32 representation of the deployment hash
          divergedDeployments.push(
            Buffer.from(bs58.decode(record.subgraph))
              .toString("hex")
              .replace("1220", "0x")
          );
        }
      });
    }
  );
  return divergedDeployments;
};

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

export const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

export const openDb = (dbName: string, logger: Logger) => {
  return new sqlite3.Database(
    dbName,
    sqlite3.OPEN_READ,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any) => {
      if (err) {
        logger.error(JSON.stringify({ error: err.message }, null, "\t"));
      }
    }
  );
};

export const DOMAIN = "poi-crosschecker";
export const DB_NAME = "poi_crosschecker";
export const TABLE_NAME = "npois";
