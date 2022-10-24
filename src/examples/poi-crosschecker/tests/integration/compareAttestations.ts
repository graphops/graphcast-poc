import { Logger } from "@graphprotocol/common-ts";
import diff from "deep-diff";
import { openDb } from "../../utils";
import { AbstractNPOIRecord } from "./types";
import { checkBlock, NPOIS_QUERY } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const compareAttestations = async (logger: Logger) => {
  const db = openDb(
    "/usr/app/dist/src/examples/poi-crosschecker/npois.db",
    logger
  );

  checkBlock(logger);

  db.all(
    NPOIS_QUERY,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, records: AbstractNPOIRecord[]) => {
      if (records.length === 0) {
        logger.debug(`DB is empty.`);
      } else {
        const nonces = records.map((r) => r.nonce);
        logger.debug(
          `All records (before filtering): ${JSON.stringify(records)}`
        );

        const timestamp = new Date().getTime();
        let smallestDiff = Number.MAX_SAFE_INTEGER;

        nonces.forEach((n) => {
          const diff = timestamp - n;
          if (diff < smallestDiff) smallestDiff = diff;
        });
        logger.debug(`Smallest diff: ${smallestDiff}`);

        const closestNonce = nonces.find((n) => timestamp - n === smallestDiff);
        logger.debug(`Closest nonce: ${closestNonce}`);

  const db = new sqlite3.Database(
    "/usr/app/dist/src/examples/poi-crosschecker/npois.db",
    sqlite3.OPEN_READ,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any) => {
      if (err) {
        console.log(JSON.stringify({ error: err.message }, null, "\t"));
      }
    }
  );

  db.all(
    "SELECT subgraph, block, nPOI FROM npois",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, records: AbstractNPOIRecord[]) => {
      if (err) {
        logger.error(JSON.stringify({ error: err.message }, null, "\t"));
      } else {
        const outerDiffs = [];

          for (let i = 0; i < stripped.length - 1; i++) {
            const innerDiffs = diff(stripped[i], stripped[i + 1]);
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
    }
  );
};
