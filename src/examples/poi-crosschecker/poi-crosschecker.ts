import "colors";
import "dotenv/config";
import { Observer } from "../../observer";
import { Messenger } from "../../messenger";
import { ClientManager } from "../../ethClient";
import {
  fetchAllocations,
  fetchPOI,
  updateCostModel,
} from "../../radio-common/queries";
import {
  Attestation,
  defaultModel,
  printNPOIs,
  processAttestations,
  storeAttestations,
  NPOIMessage,
} from "./poi-helpers";

const run = async () => {
  const clientManager = new ClientManager(
    `http://${process.env.ETH_NODE}`,
    process.env.RADIO_OPERATOR_PRIVATE_KEY,
    process.env.NETWORK_URL,
    `http://${process.env.GRAPH_NODE_HOST}:8030/graphql`,
    `http://${process.env.INDEXER_MANAGEMENT_SERVER}`,
    process.env.REGISTRY_SUBGRAPH
  );

  const observer = new Observer();
  const messenger = new Messenger();

  await observer.init(clientManager);
  await messenger.init(clientManager);

  const operatorAddress = clientManager.ethNode.getAddress().toLowerCase();

  const nPOIs: Map<string, Map<string, Attestation[]>> = new Map();
  const localnPOIs: Map<string, Map<string, string>> = new Map();

  const ethBalance = await clientManager.ethNode.getEthBalance();
  const indexerAddress = await observer.radioFilter.isOperatorOf(
    observer.clientManager.registry,
    operatorAddress
  );

  console.log(
    "🔦 Radio operator resolved to indexer address - " + indexerAddress,
    {
      operatorEthBalance: ethBalance,
      operatorPublicKey: clientManager.ethNode.wallet.publicKey,
    }
  );

  // Initial queries
  const allocations = await fetchAllocations(
    clientManager.networkSubgraph,
    indexerAddress
  );
  const deploymentIPFSs = allocations.map((a) => a.subgraphDeployment.ipfsHash);
  const topics = deploymentIPFSs.map(
    (ipfsHash) => `/graph-gossip/0/poi-crosschecker/${ipfsHash}/proto`
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

  const poi_handler = async (msg: Uint8Array) => {
    printNPOIs(nPOIs);
    console.log("👀 My nPOIs:".blue, { localnPOIs });

    try {
      // temporarily removed self check for easy testing
      console.info(
        `\n📮 A new message has been received! Parse, validate, and store\n`
          .green
      );
      const message = observer.readMessage(msg, NPOIMessage);
      const attestation: Attestation = await observer.prepareAttestation(
        message,
        NPOIMessage
      );
      storeAttestations(nPOIs, attestation);
      return nPOIs;
    } catch {
      console.error(`Failed to handle a message into attestments, moving on`);
    }
  };

  observer.observe(topics, poi_handler);

  // Get nPOIs at block over deployment ipfs hashes, and send messages about the synced POIs
  const sendNPOIs = async (block: number, DeploymentIpfses: string[]) => {
    const blockObject = await clientManager.ethNode.provider.getBlock(block);
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
      const blocks = localnPOIs.get(ipfsHash) ?? new Map();
      blocks.set(block.toString(), localPOI);
      localnPOIs.set(ipfsHash, blocks);

      const rawMessage = {
        subgraph: ipfsHash,
        nPOI: localPOI,
      };

      const encodedMessage = await messenger.writeMessage(
        NPOIMessage,
        rawMessage,
        blockObject
      );

      console.log(`:outbox_tray: Wrote and encoded message, sending`.green);
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
  clientManager.ethNode.provider.on("block", async (block) => {
    console.log(`🔗 ${block}`);

    if (block % 5 === 0) {
      // Going 5 blocks back as a buffer to make sure the node is fully synced
      sendNPOIs(block - 5, deploymentIPFSs);
      compareBlock = block + 3;
    }

    if (block == compareBlock) {
      if (localnPOIs.size > 0) {
        console.log("🔬 Comparing remote nPOIs with local nPOIs...".blue, {
          localnPOIs,
        });
      }

      const divergedDeployments = processAttestations(
        localnPOIs,
        nPOIs,
        (block - 8).toString()
      );
      if (divergedDeployments) {
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
      nPOIs.clear();
      localnPOIs.clear();
    }
  });
};

run()
  .then()
  .catch((err) => {
    console.error(`❌ Oh no! An error occurred: ${err.message}`.red);
    process.exit(1);
  });
