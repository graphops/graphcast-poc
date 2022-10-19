import { createLogger } from "@graphprotocol/common-ts";
import diff from "deep-diff";
import { ethers } from "ethers";
import { sleep } from "../../utils";

/* eslint-disable @typescript-eslint/no-var-requires */
const sqlite3 = require("sqlite3").verbose();

type AbstractNPOIRecord = {
  subgraph: string;
  block: number;
  nPOI: string;
};

const compareAttestations = async () => {
  const provider = new ethers.providers.JsonRpcProvider(process.env.ETH_NODE);

  const logger = createLogger({
    name: `poi-crosschecker-integration-tests`,
    async: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    level: process.env.logLevel as any,
  });

  const db = new sqlite3.Database(
    "/usr/app/dist/src/examples/poi-crosschecker/npois.db",
    sqlite3.OPEN_READ,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any) => {
      if (err) {
        logger.error(JSON.stringify({ error: err.message }, null, "\t"));
      }
    }
  );

  let block = await provider.getBlockNumber();
  if (block % 10 === 0) {
    logger.warning(
      "DB clearing block. Waiting for next block before compairing... "
    );

    let newBlock = await provider.getBlockNumber();
    while (newBlock === block) {
      sleep(1000);
      newBlock = await provider.getBlockNumber();
    }
    block = newBlock;
  }

  logger.debug("Block: " + block);

  let attestationBlock = 0;
  let occurrence = 0;
  let prev = block;

  while (occurrence < 2) {
    prev--;

    if (prev % 5 === 0) {
      occurrence++;
    }
    if (occurrence === 1) {
      attestationBlock = prev - 1;
    }
  }

  logger.debug("Attestation block: " + attestationBlock);

  db.all(
    "SELECT subgraph, block, nPOI FROM npois WHERE block = ?",
    attestationBlock,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, records: AbstractNPOIRecord[]) => {
      if (records.length === 0) {
        logger.warning("DB is empty.");
        return;
      }

      if (err) {
        logger.error(JSON.stringify({ error: err.message }, null, "\t"));
      } else {
        const outerDiffs = [];

        for (let i = 0; i < records.length - 1; i++) {
          const innerDiffs = diff(records[i], records[i + 1]);
          if (innerDiffs !== undefined) {
            outerDiffs.push(innerDiffs);
          }
        }

        if (outerDiffs.length > 0) {
          logger.error(JSON.stringify(outerDiffs));
        } else {
          logger.info("Compare attestations test passed. ✔️");
        }
      }
    }
  );
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
compareAttestations().then(() => {});
