import { createClient } from "@urql/core";
import fetch from "isomorphic-fetch";
import "colors";
import "dotenv/config";
import { Observer } from "../../observer";
import { Messenger } from "../../messenger";
import { EthClient } from "../../ethClient";
import {
  fetchPOI,
  updateCostModel,
} from "./queries";
import {
  fetchAllocations,
} from "./queries";
import RadioFilter from "../../radio-common/customs";
import {
  Attestation,
  defaultModel,
  printNPOIs,
  processAttestations,
  storeAttestations,
  NPOIMessage,
  prepareAttestation,
} from "./utils";

const run = async () => {
  const observer = new Observer();
  const messenger = new Messenger();
  const ethClient = new EthClient({
    infuraApiKey: process.env.INFURA_API_KEY,
    operatorPrivateKey: process.env.RADIO_OPERATOR_PRIVATE_KEY,
    network: "goerli"
  });

  await observer.init();
  await messenger.init();

  // TODO: Extract registry address operations to sdk level
  const operatorAddress = ethClient.getAddress().toLowerCase();

  const gatewayClient = createClient({ url: process.env.NETWORK_URL, fetch });
  const registryClient = createClient({
    url: process.env.REGISTRY_SUBGRAPH,
    fetch,
  });
  const graphClient = createClient({
    url: `http://${process.env.GRAPH_NODE_HOST}:8030/graphql`,
    fetch,
  });
  const { provider } = ethClient;
  const indexerClient = createClient({
    url: `http://${process.env.INDEXER_MANAGEMENT_SERVER}`,
    fetch,
  });
  const radioFilter = new RadioFilter();

  const nPOIs: Map<string, Map<string, Attestation[]>> = new Map();
  const localnPOIs: Map<string, Map<string, string>> = new Map();

  const ethBalance = await ethClient.getEthBalance();
  const indexerAddress = await radioFilter.isOperatorOf(
    registryClient,
    operatorAddress
  );

  console.log(
    "🔦 Radio operator resolved to indexer address - " + indexerAddress,
    {
      operatorEthBalance: ethBalance,
      operatorPublicKey: ethClient.wallet.publicKey,
    }
  );
  // TODO: Everything above should be moved to sdk level

  // Initial queries
  const allocations = await fetchAllocations(gatewayClient, indexerAddress);
  const deploymentIPFSs = allocations.map((a) => a.subgraphDeployment.ipfsHash);
  const topics = deploymentIPFSs.map(
    (ipfsHash) => `/graph-gossip/0/poi-crosschecker/${ipfsHash}/proto`
  );
  console.log(
    `\n👂 Initialize POI crosschecker for on-chain allocations with operator status:`
      .green,
    {
      isOperator: await radioFilter.isOperator(registryClient, operatorAddress),
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
      const attestation: Attestation = await prepareAttestation(
        message,
        NPOIMessage,
        provider,
        registryClient
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
    const blockObject = await provider.getBlock(block);
    const unavailableDplymts = [];

    DeploymentIpfses.forEach(async (ipfsHash) => {
      const localPOI = await fetchPOI(
        graphClient,
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
        ethClient,
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
  provider.on("block", async (block) => {
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
          updateCostModel(indexerClient, {
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
