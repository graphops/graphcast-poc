import { createLogger } from "@graphprotocol/common-ts";
import diff from "deep-diff";

/* eslint-disable @typescript-eslint/no-var-requires */
const sqlite3 = require("sqlite3").verbose();

type AbstractNPOIRecord = {
  subgraph: string;
  block: number;
  nPOI: string;
};

const compareAttestations = () => {
  const logger = createLogger({
    name: `poi-crosschecker-integration-tests`,
    async: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    level: process.env.logLevel as any,
  });

  const db = new sqlite3.Database(
    "/usr/app/dist/src/examples/poi-crosschecker/poi_crosschecker.db",
    sqlite3.OPEN_READ,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any) => {
      if (err) {
        console.log(JSON.stringify({ error: err.message }, null, "\t"));
      }
    }
  );

  db.all(
    "SELECT subgraph, block, nPOI FROM poi_crosschecker",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, records: AbstractNPOIRecord[]) => {
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

compareAttestations();
