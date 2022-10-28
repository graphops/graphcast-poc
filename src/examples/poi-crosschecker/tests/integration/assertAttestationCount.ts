/* eslint-disable @typescript-eslint/no-var-requires */
import { Logger } from "@graphprotocol/common-ts";
import { NPOIRecord } from "../../types";
import { DB_NAME, openDb } from "../../utils";
import { checkBlock, dedupeRecords } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-empty-function
export const assertAttestationCount = async (
  logger: Logger,
  containers: string[]
) => {
  containers = containers.filter((c) => c.includes("mock"));
  logger.debug(`Containers: ${JSON.stringify(containers)}`);

  const db = openDb(
    `/usr/app/dist/src/examples/poi-crosschecker/${DB_NAME}.db`,
    logger
  );

  checkBlock(logger);

  db.all(
    "SELECT * FROM npois",
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any, records: NPOIRecord[]) => {
      if (err) {
        logger.error(JSON.stringify({ error: err.message }));
      }

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
        logger.debug(`Containers length: ${containers.length - 1}`);

        const hasEnoughRecords =
          records.length >= Math.round((containers.length - 1) / 2);
        logger.info(`Condition is met: ${hasEnoughRecords ? "yes ✅" : "no ❌"}`);
      }
    }
  );
};
