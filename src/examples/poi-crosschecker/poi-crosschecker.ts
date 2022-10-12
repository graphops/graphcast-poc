import { GossipAgent } from "./../../radio-clients/gossipAgent";
import "colors";
import "dotenv/config";
import { ClientManager } from "../../radio-clients/clientManager";
import { fetchAllocations, fetchPOI, updateCostModel } from "./queries";
import { defaultModel, processAttestations } from "./utils";
import { createLogger } from "@graphprotocol/common-ts";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite3 = require("sqlite3").verbose();
const dbName = "/usr/app/dist/src/examples/poi-crosschecker/npois.db";

const RADIO_PAYLOAD_TYPES = [
  { name: "subgraph", type: "string" },
  { name: "nPOI", type: "string" },
];

const run = async () => {
  const logger = createLogger({
    name: `poi-crosschecker`,
    async: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    level: process.env.logLevel as any,
  });

  const db = new sqlite3.Database(
    dbName,
    sqlite3.OPEN_READWRITE,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any) => {
      if (err) {
        logger.error(err.message);
        throw new Error(`Failed to connect to database ${dbName}`);
      }
      logger.info("Connected to the poi-crosschecker database.");
    }
  );

  db.run(
    "CREATE TABLE IF NOT EXISTS npois (subgraph VARCHAR, block BIGINT, nPOI VARCHAR, operator VARCHAR, stake_weight BIGINT)"
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

  // Initial queries
  const deploymentIPFSs = (
    await fetchAllocations(
      logger,
      gossipAgent.clientManager.networkSubgraph,
      indexerAddress
    )
  ).map((a) => a.subgraphDeployment.ipfsHash);
  deploymentIPFSs.push(process.env.TEST_TOPIC);
  const topics = deploymentIPFSs.map(
    (ipfsHash: string) => `/graph-gossip/0/poi-crosschecker/${ipfsHash}/proto`
  );
  logger.info(
    `👂 Initialize POI crosschecker for on-chain allocations with operator status:`,
    {
      indexerAddress:
        indexerAddress ??
        "Graphcast agent is not registered as an indexer operator",
      topics,
    }
  );

  const poiHandler = async (msg: Uint8Array, topic: string) => {
    try {
      // temporarily removed self check for easy testing
      logger.info(`📮 A new message has been received! Handling the message`);
      const message = await gossipAgent.processMessage({
        msg,
        topic,
        types: RADIO_PAYLOAD_TYPES,
      });

      const { radioPayload, blockNumber, sender, stakeWeight } = message;
      const { nPOI, subgraph } = JSON.parse(radioPayload);

      logger.info(`Payload: Subgraph (ipfs hash)`, { subgraph, nPOI });

      db.serialize(() => {
        const stmt = db.prepare("INSERT INTO npois VALUES (?, ?, ?, ?, ?)");
        stmt.run(subgraph, blockNumber, nPOI, sender, stakeWeight);
        stmt.finalize();
      });
    } catch {
      logger.warn(`Failed to handle a message into attestation, moving on`);
    }
  };

  gossipAgent.observer.observe(topics, poiHandler);

  // Get nPOIs at block over deployment ipfs hashes, and send messages about the synced POIs
  const sendNPOIs = async (block: number, DeploymentIpfses: string[]) => {
    const blockObject =
      await gossipAgent.clientManager.ethClient.provider.getBlock(block);
    const unavailableDplymts = [];

    DeploymentIpfses.forEach(async (ipfsHash) => {
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

      db.serialize(() => {
        const stmt = db.prepare("INSERT INTO npois VALUES (?, ?, ?, ?, ?)");
        stmt.run(
          ipfsHash,
          block,
          localPOI,
          gossipAgent.clientManager.ethClient.getAddress(),
          selfStake
        );
        stmt.finalize();
      });

      await gossipAgent.messenger.sendMessage(
        encodedMessage,
        `/graph-gossip/0/poi-crosschecker/${ipfsHash}/proto`
      );
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
        logger.warn(`⚠️ Handle POI divergences to avoid query traffic`, {
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
      }

      //Q: change cost models dynamically. maybe output divergedDeployment?
      console.log("🗑️ Cleaning DB.");
      db.run("DELETE FROM npois");
    }
  });
};

run()
  .then()
  .catch((err) => {
    console.error(`❌ Oh no! An error occurred: ${err.message}`.red);
    process.exit(1);
  });
