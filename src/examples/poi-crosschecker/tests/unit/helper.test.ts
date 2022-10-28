import { NPOIRecord } from "./../../types";
import { sleep, sortAttestations } from "./../../utils";
import { createLogger, Logger } from "@graphprotocol/common-ts";
import { processAttestations } from "../../utils";

/* eslint-disable @typescript-eslint/no-var-requires */
const sqlite3 = require("sqlite3").verbose();

let logger: Logger;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let db: any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any

const setup = async () => {
  logger = createLogger({
    name: `poi-crosschecker`,
    async: false,
    level: "fatal",
  });

  db = new sqlite3.Database(":memory:", [sqlite3.OPEN_READWRITE])

  db.run(
    "CREATE TABLE IF NOT EXISTS npois (subgraph VARCHAR, block BIGINT, nPOI VARCHAR, indexer VARCHAR, stake_weight BIGINT, nonce BIGINT)"
  );

  await sleep(50);

  db.run("INSERT INTO npois VALUES (?, ?, ?, ?, ?, ?)", [
    "Qmaaa",
    0,
    "0x0",
    "indexer1",
    1,
    Date.now()
  ]);
};

const teardown = async () => {
  await db.close();
};

describe("Radio helpers", () => {
  beforeAll(setup);
  afterAll(teardown);
  describe("Process attestations", () => {
    // no divergence, and if tweak any of attestations we should catch divergence
    test("single local record", async () => {
      const targetBlock = 0;
      const diverged = processAttestations(
        logger,
        targetBlock,
        "indexer1",
        db
      );
      expect(diverged).toHaveLength(0);

      // another indexer at different block, no diverged
      db.run("INSERT INTO npois VALUES (?, ?, ?, ?, ?, ?)", [
        "Qmaaa",
        1,
        "0x0",
        "indexer2",
        1,
        Date.now(),
      ]);
      const diverged2 = processAttestations(logger, 1, "indexer1", db);

      expect(diverged2).toHaveLength(0);

      // another indexer with same nPOI, no diverged
      db.run("INSERT INTO npois VALUES (?, ?, ?, ?, ?, ?)", [
        "Qmaaa",
        0,
        "0x0",
        "indexer2",
        1,
        Date.now(),
      ]);
      const diverged3 = processAttestations(logger, 1, "indexer1", db);
      expect(diverged3).toHaveLength(0);
    });

    test("add attacks", async () => {
      // different block
      db.run("INSERT INTO npois VALUES (?, ?, ?, ?, ?, ?)", [
        "Qmaaa",
        1,
        "0x1",
        "indexer2",
        1,
        Date.now(),
      ]);

      const diverged = processAttestations(logger, 1, "indexer1", db);
      expect(diverged).toHaveLength(0);

      // same block, weak stake attack => no diverge
      db.run("INSERT INTO npois VALUES (?, ?, ?, ?, ?, ?)", [
        "Qmaaa",
        0,
        "0x1",
        "indexer2",
        1,
        Date.now(),
      ]);

      const diverged2 = processAttestations(logger, 1, "indexer1", db);
      expect(diverged2).toHaveLength(0);

      // same block, strong friend => no diverge
      db.run("INSERT INTO npois VALUES (?, ?, ?, ?, ?, ?)", [
        "Qmaaa",
        0,
        "0x1",
        "indexer2",
        2,
        Date.now(),
      ]);

      const diverged3 = processAttestations(logger, 0, "indexer1", db);

      await sleep(50);
      expect(diverged3).toHaveLength(1);
    });
  });
  describe("Sort attestations", () => {
    test("Normalcy - no POI divergence", async () => {
      const records: NPOIRecord[] = [
        {
          subgraph: "Qmaaa",
          block: 0,
          nPOI: "0x0",
          indexer: "indexer0",
          stakeWeight: 5,
          nonce: Date.now(),
        },
        {
          subgraph: "Qmaaa",
          block: 0,
          nPOI: "0x1",
          indexer: "indexer1",
          stakeWeight: 3,
          nonce: Date.now(),
        },
        {
          subgraph: "Qmaaa",
          block: 0,
          nPOI: "0x0",
          indexer: "indexer2",
          stakeWeight: 3,
          nonce: Date.now(),
        },
      ];
      let sorted = sortAttestations(records);
      expect(sorted[0].nPOI).toEqual("0x0");
      expect(sorted[0].stakeWeight).toEqual(8);

      records.push({
        subgraph: "Qmaaa",
        block: 0,
        nPOI: "0x2",
        indexer: "indexer2",
        stakeWeight: 6,
        nonce: Date.now(),
      });
      sorted = sortAttestations(records);
      expect(sorted[0].nPOI).toEqual("0x0");
      expect(sorted[0].stakeWeight).toEqual(8);

      records.push({
        subgraph: "Qmaaa",
        block: 0,
        nPOI: "0x5",
        indexer: "indexer2",
        stakeWeight: 9,
        nonce: Date.now(),
      });
      sorted = sortAttestations(records);
      expect(sorted[0].nPOI).toEqual("0x5");
      expect(sorted[0].stakeWeight).toEqual(9);
    });
  });
});
