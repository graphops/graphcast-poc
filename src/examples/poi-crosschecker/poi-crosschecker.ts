import { createClient } from "@urql/core";
import fetch from "isomorphic-fetch";
import "colors";
import "dotenv/config";
import { Observer } from "../../observer";
import { Messenger } from "../../messenger";
import { EthClient } from "../../ethClient";
import {
  fetchAllocations,
  fetchPOI,
  updateCostModel,
} from "../../radio-common/queries";
import RadioFilter from "../../radio-common/customs";
import {
  Attestation,
  defaultModel,
  domain,
  printNPOIs,
  processAttestations,
  storeAttestations,
  types,
  prepareAttestation,
} from "./utils";

const run = async () => {
  const observer = new Observer();
  const messenger = new Messenger();
  const ethClient = new EthClient();

  await observer.init();
  await messenger.init();

  // TODO: Move this to eth client
  const operatorAddress = ethClient.getAddress().toLowerCase();

  const gatewayclient = createClient({ url: process.env.NETWORK_URL, fetch });
  const registryClient = createClient({
    url: process.env.REGISTRY_SUBGRAPH,
    fetch,
  });
  const graphNodeEndpoint = `http://${process.env.GRAPH_NODE_HOST}:8030/graphql`;
  const graphClient = createClient({ url: graphNodeEndpoint, fetch });
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

  // let Message;
  // protobuf.load("./proto/NPOIMessage.proto", async (err, root) => {
  //   if (err) {
  //     throw err;
  //   }
  //   Message = root.lookupType("gossip.NPOIMessage");
  // });

  // Initial queries
  const allocations = await fetchAllocations(gatewayclient, indexerAddress);
  const deploymentIPFSs = allocations.map((a) => a.subgraphDeployment.ipfsHash);
  const topics = deploymentIPFSs.map(
    (ipfsHash) => `/graph-gossip/0/poi-crosschecker/${ipfsHash}/proto`
  );
  const poiMessageValues = (subgraph: string, nPOI: string) => {
    return {
      subgraph,
      nPOI,
    };
  };
  console.log(
    `\n👂 Initialize POI crosschecker for on-chain allocations with operator status:`
      .green,
    {
      isOperator: await radioFilter.isOperator(registryClient, operatorAddress),
      topics,
    }
  );

  const poiHandler = async (msg: Uint8Array) => {
    printNPOIs(nPOIs);
    console.log("👀 My nPOIs:".blue, { localnPOIs });

    try {
      // temporarily removed self check for easy testing
      console.info(
        `\n📮 A new message has been received! Parse, validate, and store...\n`
          .green
      );
      const attestation: Attestation = await prepareAttestation(
        msg,
        domain,
        types,
        poiMessageValues,
        provider,
        radioFilter,
        registryClient
      );
      storeAttestations(nPOIs, attestation);
      return nPOIs;
    } catch {
      console.error(`Failed to handle a message into attestments, moving on`);
    }
  };

  observer.observe(topics, poiHandler);

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

      const payload = {
        subgraph: ipfsHash,
        nPOI: localPOI,
      };

      console.log(`📬 Wrote and encoded message, sending`.green);

      // Move all of the sending into one function that we pass the payload to
      await messenger.sendMessage(
        ethClient,
        payload,
        domain,
        types,
        blockObject,
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
