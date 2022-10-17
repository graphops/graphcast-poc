import { NPOIRecord } from './../../types';
import { sortAttestations } from './../../utils';
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
    "CREATE TABLE IF NOT EXISTS npois (subgraph VARCHAR, block BIGINT, nPOI VARCHAR, operator VARCHAR, stake_weight BIGINT)"
  );

  await db.serialize(() => {
    const addStmt = db.prepare("INSERT INTO npois VALUES (?, ?, ?, ?, ?)");
    addStmt.run("Qmaaa", 0, "0x0", "operator1", 1);
    addStmt.finalize();
  });
};

const teardown = async () => {
  await db.close()
}

describe("Radio helpers", () => {
  beforeAll(setup);
  afterAll(teardown);
  describe("Process attestations", () => {
    // no divergence, and if tweak any of attestations we should catch divergence
    test("single local record", async () => {
      const targetBlock = 0
      const diverged = processAttestations(
        logger,
        targetBlock,
        "operator1",
        db)
      expect(diverged).toHaveLength(0);

      // another operator at different block, no diverged
      await db.serialize(() => {
        const addStmt = db.prepare("INSERT INTO npois VALUES (?, ?, ?, ?, ?)");
        addStmt.run("Qmaaa", 1, "0x0", "operator2", 1);
        addStmt.finalize();
      });
      const diverged2 = processAttestations(
        logger,
        1,
        "operator1",
        db)

      expect(diverged2).toHaveLength(0);

      // another operator with same nPOI, no diverged
      await db.serialize(() => {
        const addStmt = db.prepare("INSERT INTO npois VALUES (?, ?, ?, ?, ?)");
        addStmt.run("Qmaaa", 0, "0x0", "operator2", 1);
        addStmt.finalize();
      });
      const diverged3 = processAttestations(
        logger,
        1,
        "operator1",
        db)
      expect(diverged3).toHaveLength(0);
    });
    
    test("add attacks", async () => {
      // different block
      await db.serialize(() => {
        const addStmt = db.prepare("INSERT INTO npois VALUES (?, ?, ?, ?, ?)");
        addStmt.run("Qmaaa", 1, "0x1", "operator2", 1);
        addStmt.finalize();
      });
      const diverged = processAttestations(
        logger,
        1,
        "operator1",
        db)
      expect(diverged).toHaveLength(0);

      // same block, weak stake attack => no diverge
      await db.serialize(() => {
        const addStmt = db.prepare("INSERT INTO npois VALUES (?, ?, ?, ?, ?)");
        addStmt.run("Qmaaa", 0, "0x1", "operator2", 1);
        addStmt.finalize();
      });
      const diverged2 = processAttestations(
        logger,
        1,
        "operator1",
        db)
      expect(diverged2).toHaveLength(0);

      // same block, strong friend => no diverge
      await db.serialize(() => {
        const addStmt = db.prepare("INSERT INTO npois VALUES (?, ?, ?, ?, ?)");
        addStmt.run("Qmaaa", 0, "0x1", "operator2", 2);
        addStmt.finalize();
      });

      const diverged3 = processAttestations(
        logger,
        0,
        "operator1",
        db
      )
      // TODO: DOUBLE CHECK WHY THIS ONE DELAYS SOMETIMES
      // expect(diverged3).toHaveLength(1);
    });
  });
  describe("Sort attestations", () => {
    test("Normalcy - no POI divergence", async () => {
      const records:NPOIRecord[] = [
        {subgraph: "Qmaaa",
        block: 0,
        nPOI: "0x0",
        operator: "operator0",
        stakeWeight: 5},
        {subgraph: "Qmaaa",
        block: 0,
        nPOI: "0x1",
        operator: "operator1",
        stakeWeight: 3},
        {subgraph: "Qmaaa",
        block: 0,
        nPOI: "0x0",
        operator: "operator2",
        stakeWeight: 3}
      ]
      let sorted = sortAttestations(records)
      expect(sorted[0].nPOI).toEqual("0x0")
      expect(sorted[0].stakeWeight).toEqual(8)
      
      records.push({subgraph: "Qmaaa",
        block: 0,
        nPOI: "0x2",
        operator: "operator2",
        stakeWeight: 6})
      sorted = sortAttestations(records)
      expect(sorted[0].nPOI).toEqual("0x0")
      expect(sorted[0].stakeWeight).toEqual(8)
      
      records.push({subgraph: "Qmaaa",
        block: 0,
        nPOI: "0x5",
        operator: "operator2",
        stakeWeight: 9})
      sorted = sortAttestations(records)
      expect(sorted[0].nPOI).toEqual("0x5")
      expect(sorted[0].stakeWeight).toEqual(9)  
    });
  });
});
