import "colors";
import "dotenv/config";
import { Observer } from "../../observer";
import { Messenger } from "../../messenger";
import { ClientManager } from "../../ethClient";
import { fetchAllocations, fetchPOI, updateCostModel } from "./queries";
import { defaultModel, processAttestations } from "./utils";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const sqlite3 = require("sqlite3").verbose();

const RADIO_PAYLOAD_TYPES = [
  { name: "subgraph", type: "string" },
  { name: "nPOI", type: "string" },
];

const run = async () => {
  const db = new sqlite3.Database(
    "/usr/app/poi_crosschecker.db",
    sqlite3.OPEN_READWRITE,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (err: any) => {
      if (err) {
        console.error(err.message);
      } else {
        console.log("Connected to the poi-crosschecker database.");
      }
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

  const observer = new Observer();
  const messenger = new Messenger();

  await observer.init(clientManager);
  await messenger.init(clientManager);

  const operatorAddress = clientManager.ethClient.getAddress().toLowerCase();

  const ethBalance = await clientManager.ethClient.getEthBalance();
  const indexerAddress = await observer.radioFilter.isOperatorOf(
    observer.clientManager.registry,
    operatorAddress
  );

  console.log(
    `🔦 Radio operator resolved to indexer address ${operatorAddress} -> ${indexerAddress}`,
    {
      operatorEthBalance: ethBalance,
      operatorPublicKey: clientManager.ethClient.wallet.publicKey,
    }
  );

  // Initial queries
  const deploymentIPFSs =
    [process.env.TEST_TOPIC] ??
    (await fetchAllocations(clientManager.networkSubgraph, indexerAddress)).map(
      (a) => a.subgraphDeployment.ipfsHash
    );
  const topics = deploymentIPFSs.map(
    (ipfsHash: string) => `/graph-gossip/0/poi-crosschecker/${ipfsHash}/proto`
  );
  console.log(
    `\n👂 Initialize POI crosschecker for on-chain allocations with operator status:`
      .green,
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
      console.info(
        `\n📮 A new message has been received! Handling the message\n`.green
      );
      const message = await observer.readMessage({
        msg,
        topic,
        types: RADIO_PAYLOAD_TYPES,
      });

      //TODO: Need to fix radioPayload formatting - cannot destructure property right now
      const { radioPayload, blockNumber, sender, stakeWeight } = message;
      const { nPOI, subgraph } = JSON.parse(radioPayload);

      const indexerAddress = await observer.radioFilter.isOperatorOf(
        clientManager.registry,
        sender
      );

      console.info(
        `Payload: Subgraph (ipfs hash): ${subgraph}\nnPOI: ${nPOI}\n`.green
      );

      db.serialize(() => {
        const stmt = db.prepare("INSERT INTO npois VALUES (?, ?, ?, ?, ?)");
        stmt.run(
          subgraph,
          blockNumber,
          nPOI,
          sender,
          stakeWeight
        );
        stmt.finalize();
      });
    } catch {
      console.error(`Failed to handle a message into attestation, moving on.`);
    }
  };

  observer.observe(topics, poiHandler);

  // Get nPOIs at block over deployment ipfs hashes, and send messages about the synced POIs
  const sendNPOIs = async (block: number, DeploymentIpfses: string[]) => {
    const blockObject = await clientManager.ethClient.provider.getBlock(block);
    const unavailableDplymts = [];

    DeploymentIpfses.forEach(async (ipfsHash) => {
      const localPOI = await fetchPOI(
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

      console.log(`📬 Wrote and encoded message, sending`.green);
      await messenger.sendMessage(
        encodedMessage,
        `/graph-gossip/0/poi-crosschecker/${ipfsHash}/proto`
      );
    });

    if (unavailableDplymts.length > 0) {
      console.log(
        `😔 Could not get nPOI for following subgraphs at block ${block}. Please check if your node has fully synced the subgraphs below:`
          .red,
        { unavailableDplymts }
      );
    }
  };

  let compareBlock = 0;
  clientManager.ethClient.provider.on("block", async (block) => {
    console.log(`🔗 ${block}`);

    if (block % 5 === 0) {
      // Going 5 blocks back as a buffer to make sure the node is fully synced
      sendNPOIs(block - 5, deploymentIPFSs);
      compareBlock = block + 3;
    }

    if (block == compareBlock) {
      console.log("🔬 Comparing remote nPOIs with local nPOIs...".blue);

      const divergedDeployments = processAttestations(
        block - 8,
        operatorAddress,
        db
      );
      if (divergedDeployments.length > 0) {
        console.log(`⚠️ Handle POI divergences to avoid query traffic`.red, {
          divergedDeployments,
          defaultModel,
        });
        divergedDeployments.map((deployment) =>
          //TODO: add response handling
          updateCostModel(clientManager.indexerManagement, {
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
