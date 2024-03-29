import { Logger } from "@graphprotocol/common-ts";
import diff from "deep-diff";
import { NPOIRecord } from "../../types";
import { DB_NAME, openDb } from "../../utils";
import { checkBlock, dedupeRecords } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const compareAttestations = async (logger: Logger) => {
  const db = openDb(
    `/usr/app/dist/src/examples/poi-crosschecker/${DB_NAME}.db`,
    logger
  );

  checkBlock(logger);

  db.all(
    "SELECT * FROM npois",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, records: NPOIRecord[]) => {
      if (records.length === 0) {
        logger.debug(`DB is empty.`);
      } else {
        const nonces = records.map((r) => r.nonce);
        records = dedupeRecords(records, "indexer");

        logger.debug(
          `All records (deduped, before filtering): ${JSON.stringify(records)}`
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

        const closestAttestation = records.find(
          (r) => (r.nonce = closestNonce)
        );

        logger.debug(`Attestation block: ${closestAttestation.block}`);

        records = records.filter((r) => r.block === closestAttestation.block);
        logger.debug(`Records length: ${records.length}`);

        const stripped = records.map((r) => {
          return {
            subgraph: r.subgraph,
            block: r.block,
            nPOI: r.nPOI,
          };
        });

        if (err) {
          logger.error(JSON.stringify({ error: err.message }));
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
            logger.info("Compare attestations test passed. ✅");
          }
        }
      }
    }
  );
};
