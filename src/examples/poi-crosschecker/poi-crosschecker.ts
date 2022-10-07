import "colors";
import "dotenv/config";
import { Observer } from "../../observer";
import { Messenger } from "../../messenger";
import { ClientManager } from "../../ethClient";
import { fetchAllocations, fetchPOI, updateCostModel } from "./queries";
import { defaultModel, processAttestations } from "./utils";
import { createLogger } from "@graphprotocol/common-ts";
import { Waku } from "js-waku";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite3 = require("sqlite3").verbose();
const dbName = "/usr/app/poi_crosschecker.db";

const RADIO_PAYLOAD_TYPES = [
  { name: "subgraph", type: "string" },
  { name: "nPOI", type: "string" },
];

const run = async () => {
  const waku = await Waku.create({
    bootstrap: {
      default: true,
    },
  });

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

  const messenger = new Messenger();
  const observer = new Observer();

  await messenger.init(logger, waku, clientManager);
  await observer.init(logger, waku, clientManager);

  const operatorAddress = clientManager.ethClient.getAddress().toLowerCase();

  const ethBalance = await clientManager.ethClient.getEthBalance();
  const indexerAddress = await observer.radioFilter.isOperatorOf(
    observer.clientManager.registry,
    operatorAddress
  );

  logger.debug(
    `🔦 Radio operator resolved to indexer address ${operatorAddress} -> ${indexerAddress}`,
    {
      operatorEthBalance: ethBalance,
      operatorPublicKey: clientManager.ethClient.wallet.publicKey,
    }
  );

  // Initial queries
  const deploymentIPFSs =
    [process.env.TEST_TOPIC] ??
    (
      await fetchAllocations(
        logger,
        clientManager.networkSubgraph,
        indexerAddress
      )
    ).map((a) => a.subgraphDeployment.ipfsHash);
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
      const message = await observer.readMessage({
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

  observer.observe(topics, poiHandler);

  // Get nPOIs at block over deployment ipfs hashes, and send messages about the synced POIs
  const sendNPOIs = async (block: number, DeploymentIpfses: string[]) => {
    const blockObject = await clientManager.ethClient.provider.getBlock(block);
    const unavailableDplymts = [];

    DeploymentIpfses.forEach(async (ipfsHash) => {
      const localPOI = await fetchPOI(
        logger,
        clientManager.graphNodeStatus,
        ipfsHash,
        block,
        blockObject.hash,
        indexerAddress
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

      const encodedMessage = await messenger.writeMessage({
        radioPayload,
        types: RADIO_PAYLOAD_TYPES,
        block: blockObject,
      });

      logger.debug(`📬 Wrote and encoded message, sending`);
      await messenger.sendMessage(
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
  clientManager.ethClient.provider.on("block", async (block) => {
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
        operatorAddress,
        db
      );
      if (divergedDeployments.length > 0) {
        logger.warn(`⚠️ Handle POI divergences to avoid query traffic`, {
          divergedDeployments,
          defaultModel,
        });
        divergedDeployments.map((deployment) =>
          //TODO: add response handling
          updateCostModel(logger, clientManager.indexerManagement, {
            deployment,
            model: defaultModel,
            variables: null,
          })
        );
      }

      //Q: change cost models dynamically. maybe output divergedDeployment?
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
