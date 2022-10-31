import { GossipAgent } from "./../../radio-clients/gossipAgent";
import "colors";
import "dotenv/config";
import { ClientManager } from "../../radio-clients/clientManager";
import {
  fetchAllocatedDeployments,
  fetchPOI,
  updateCostModel,
} from "./queries";
import {
  DB_NAME,
  defaultModel,
  DOMAIN,
  processAttestations,
  TABLE_NAME,
} from "./utils";
import { createLogger } from "@graphprotocol/common-ts";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite3 = require("sqlite3").verbose();
const RADIO_PAYLOAD_TYPES = [
  { name: "subgraph", type: "string" },
  { name: "nPOI", type: "string" },
];

const logger = createLogger({
  name: DOMAIN,
  async: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  level: process.env.logLevel as any,
});

const run = async () => {
  const db = new sqlite3.Database(
    `/usr/app/dist/src/examples/poi-crosschecker/${DB_NAME}.db`,
    sqlite3.OPEN_READWRITE,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any) => {
      if (err) {
        logger.error(err.message);
        throw new Error(`Failed to connect to database ${DB_NAME}`);
      }
      logger.info(`Connected to the ${DB_NAME} database.`);
    }
  );

  db.run(
    `CREATE TABLE IF NOT EXISTS ${TABLE_NAME} (subgraph VARCHAR, block BIGINT, nPOI VARCHAR, indexer VARCHAR, stake_weight BIGINT, nonce BIGINT)`
  );

  const clientManager = new ClientManager({
    operatorPrivateKey: process.env.RADIO_OPERATOR_PRIVATE_KEY,
    ethNodeUrl: process.env.ETH_NODE,
    registry: process.env.REGISTRY_SUBGRAPH,
    graphNodeStatus: process.env.GRAPH_NODE,
    indexerManagementServer: process.env.INDEXER_MANAGEMENT_SERVER,
    graphNetworkUrl: process.env.NETWORK_SUBGRAPH,
  });

  const gossipAgent = new GossipAgent(logger, clientManager);
  const indexerAddress = await gossipAgent.init();

  logger.debug(
    `🔦 Radio operator resolved to indexer address ${indexerAddress}`,
    {
      operatorPublicKey: gossipAgent.clientManager.ethClient.wallet.publicKey,
    }
  );

  const poiHandler = async (msg: Uint8Array, topic: string) => {
    try {
      logger.info(`📮 A new message has been received! Handling the message`);
      const message = await gossipAgent.processMessage({
        msg,
        topic,
        types: RADIO_PAYLOAD_TYPES,
      });

      const { radioPayload, blockNumber, stakeWeight, nonce } = message;
      const { nPOI, subgraph } = JSON.parse(radioPayload);

      logger.info(`Payload: Subgraph (ipfs hash)`, { subgraph, nPOI });

      db.run(`INSERT INTO ${TABLE_NAME} VALUES (?, ?, ?, ?, ?, ?)`, [
        subgraph,
        blockNumber,
        nPOI,
        indexerAddress,
        stakeWeight,
        nonce,
      ]);
    } catch (error) {
      logger.warn(`Failed to handle a message into attestation, moving on`, {
        error,
      });
    }
  };

  // Topic fetcher and handler for specific radio name (need a good name)
  const deploymentIPFSs = await gossipAgent.establishTopics(
    DOMAIN,
    poiHandler,
    fetchAllocatedDeployments
  );

  if (process.env.TEST_TOPIC) {
    deploymentIPFSs.push(process.env.TEST_TOPIC);
  }

  logger.info(
    `👂 Initialize POI crosschecker for on-chain allocations with operator status:`,
    {
      indexerAddress:
        indexerAddress ??
        "Graphcast agent is not registered as an indexer operator",
      topic: deploymentIPFSs,
    }
  );

  // Get nPOIs at block over deployment ipfs hashes, and send messages about the synced POIs
  const sendNPOIs = async (block: number, deploymentIpfses: string[]) => {
    const blockObject =
      await gossipAgent.clientManager.ethClient.provider.getBlock(block);
    const unavailableDplymts = [];

    deploymentIpfses.forEach(async (ipfsHash) => {
      const localPOI = await fetchPOI(
        logger,
        gossipAgent.clientManager.graphNodeStatus,
        ipfsHash,
        block,
        blockObject.hash
      );

      if (!localPOI) {
        //Q: If the agent doesn't find a ipfshash, it probably makes sense to setCostModel as well
        // However this handling makes more sense to be in the agent
        unavailableDplymts.push(ipfsHash);
        return;
      }

      const radioPayload = {
        subgraph: ipfsHash,
        nPOI: localPOI,
      };

      const encodedMessage = await gossipAgent.messenger.writeMessage({
        radioPayload,
        types: RADIO_PAYLOAD_TYPES,
        block: blockObject,
      });

      logger.debug(`📬 Wrote and encoded message, sending`);

      const selfStake = await gossipAgent.radioFilter.indexerCheck(
        indexerAddress
      );

      db.run(`INSERT INTO ${TABLE_NAME} VALUES (?, ?, ?, ?, ?, ?)`, [
        ipfsHash,
        block,
        localPOI,
        indexerAddress,
        selfStake,
        Date.now(),
      ]);

      await gossipAgent.messenger.sendMessage(encodedMessage, DOMAIN, ipfsHash);
    });

    if (unavailableDplymts.length > 0) {
      logger.warn(
        `😔 Could not get nPOI for following subgraphs at block ${block}. Please check if your node has fully synced the subgraphs below:`,
        { unavailableDplymts }
      );
    }
  };

  let compareBlock = 0;
  gossipAgent.clientManager.ethClient.provider.on("block", async (block) => {
    logger.debug(`🔗 ${block}`);

    if (block % 5 === 0) {
      logger.info("🗑️ Cleaning DB.");
      db.run(`DELETE FROM ${TABLE_NAME}`);

      // Going 5 blocks back as a buffer to make sure the node is fully synced
      sendNPOIs(block - 5, deploymentIPFSs);
      compareBlock = block + 3;
    }

    if (block == compareBlock) {
      logger.debug("🔬 Comparing remote nPOIs with local nPOIs...");

      const divergedDeployments = processAttestations(
        logger,
        block - 8,
        indexerAddress,
        db
      );
      if (divergedDeployments.length > 0) {
        logger.error(`⚠️ Handle POI divergences to avoid query traffic`, {
          divergedDeployments,
          defaultModel,
        });
        divergedDeployments.map((deployment) =>
          //TODO: add response handling
          updateCostModel(logger, gossipAgent.clientManager.indexerManagement, {
            deployment,
            model: defaultModel,
            variables: null,
          })
        );
      } else {
        logger.info("No diverged deployments found! ✅");
      }

      //Q: change cost models dynamically. maybe output divergedDeployment?
    }
  });
};

run()
  .then()
  .catch((err) => {
    logger.error(`❌ Oh no! An error occurred: ${err.message}`.red);
    process.exit(1);
  });
