import { createClient } from "@urql/core";
import fetch from "isomorphic-fetch";
import "colors";
import "dotenv/config";
import { Observer } from "../../observer";
import { Messenger } from "../../messenger";
import { EthClient } from "../../ethClient";
import { Attestation } from "../../radio-common/types";
import {
  fetchAllocations,
  fetchPOI,
  updateCostModel,
} from "../../radio-common/queries";
import { printNPOIs, sortAttestations } from "../../radio-common/utils";
import RadioFilter from "../../radio-common/customs";
import bs58 from "bs58";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const protobuf = require("protobufjs");

const run = async () => {
  const observer = new Observer();
  const messenger = new Messenger();
  const ethClient = new EthClient();

  await observer.init();
  await messenger.init();

  //const publicKey = ethClient.getPublicKey();
  const operatorAddress = ethClient.getAddress().toLowerCase();

  const client = createClient({ url: process.env.NETWORK_URL, fetch });
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

  // Initial queries
  const allocations = await fetchAllocations(client, indexerAddress);
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

  const handler = (msg: Uint8Array) => {
    printNPOIs(nPOIs);
    console.log("👀 My nPOIs:".blue, { localnPOIs });

    protobuf.load("./proto/NPOIMessage.proto", async (err, root) => {
      if (err) {
        throw err;
      }

      let message;
      try {
        const Message = root.lookupType("gossip.NPOIMessage");
        const decodedMessage = Message.decode(msg);

        message = Message.toObject(decodedMessage, {
          nonce: Number,
          timestamp: Number,
          blockNumber: Number,
          blockHash: String,
          sender: String,
          subgraph: String,
          nPOI: String,
        });
      } catch (error) {
        console.error(
          `Protobuf reader could not decode message, assume corrupted`
        );
        return;
      }

      const {
        nonce,
        timestamp,
        blockNumber,
        blockHash,
        sender,
        subgraph,
        nPOI,
      } = message;
      // temporarily removed self check for easy testing
      console.info(
        `\n📮 A new message has been received!\nTimestamp: ${timestamp}\nBlock number: ${blockNumber}\nSubgraph (ipfs hash): ${subgraph}\nnPOI: ${nPOI}\nSender: ${sender}\nNonce: ${nonce}`
          .green
      );

      // Message Validity (check registry identity, time, stake, dispute) for which to skip by returning early
      const block = await provider.getBlock(Number(blockNumber))
      const stake = await radioFilter.poiMsgValidity(
        registryClient,
        sender,
        timestamp,
        Number(nonce),
        blockHash,
        block
      );
      if (stake <= 0) {
        console.warn(
          `\nMessage considered compromised, intercepting\n`
            .red
        );
        return;
      }

      const attestation: Attestation = {
        nPOI,
        indexerAddress: sender,
        stake: BigInt(stake),
      };
      console.debug(`Valid message, caching attestation`.green, {
        attestation,
      });
      if (nPOIs.has(subgraph)) {
        const blocks = nPOIs.get(subgraph);
        if (blocks.has(blockNumber.toString())) {
          const attestations = [...blocks.get(blockNumber.toString())];
          attestations.push(attestation);
          blocks.set(blockNumber.toString(), attestations);
        } else {
          blocks.set(blockNumber.toString(), [attestation]);
        }
      } else {
        const blocks = new Map();
        blocks.set(blockNumber.toString(), [attestation]);
        nPOIs.set(subgraph, blocks);
      }
    });
  };

  observer.observe(topics, handler);

  // Get nPOIs at block over deployment ipfs hashes, and send messages about the synced POIs
  const sendNPOIs = async (block: number, DeploymentIpfses: string[]) => {
    const blockObject = await provider.getBlock(block);
    const unavailableDplymts = [];
    //TODO: parallelize?
    for (let i = 0; i < DeploymentIpfses.length; i++) {
      const ipfsHash = DeploymentIpfses[i];
      const localPOI = await fetchPOI(
        graphClient,
        ipfsHash,
        block,
        blockObject.hash,
        indexerAddress
      );

      if (localPOI == undefined || localPOI == null) {
        //Q: If the agent doesn't find a ipfshash, it probably makes sense to setCostModel as well
        // However this handling makes more sense to be in the agent
        unavailableDplymts.push(ipfsHash);
      } else {
        //TODO: normalize POI
        protobuf.load("./proto/NPOIMessage.proto", async (err, root) => {
          if (err) {
            throw err;
          }

          const blocks = localnPOIs.get(ipfsHash) ?? new Map();
          blocks.set(block.toString(), localPOI);
          localnPOIs.set(ipfsHash, blocks);

          const Message = root.lookupType("gossip.NPOIMessage");
          const message = {
            nonce: messenger.nonce,
            timestamp: new Date().getTime(),
            blockNumber: blockObject.number,
            blockHash: blockObject.hash,
            sender: process.env.RADIO_OPERATOR,
            subgraph: ipfsHash,
            nPOI: localPOI,
            sender: operatorAddress,
          };
          const encodedMessage = Message.encode(message).finish();
          await messenger.sendMessage(
            encodedMessage,
            `/graph-gossip/0/poi-crosschecker/${ipfsHash}/proto`
          );
        });
      }
    }
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
      const divergedDeployment: string[] = [];
      localnPOIs.forEach((blocks, subgraphDeployment) => {
        const remoteBlocks = nPOIs.get(subgraphDeployment);
        if (remoteBlocks && remoteBlocks.size >= 0) {
          const attestations = remoteBlocks.get((block - 8).toString());
          if (!attestations) {
            console.log(
              `No attestations for $(subgraphDeployment) on block ${
                block - 8
              } at the moment`
            );
            return;
          }

          const topAttestation = sortAttestations(attestations)[0];
          const localNPOI = blocks.get((block - 8).toString());
          console.log(`📒 Attestation check`.blue, {
            subgraphDeployment,
            block: block - 8,
            attestations,
            mostStaked: topAttestation.nPOI,
            localNPOI,
          });

          if (topAttestation.nPOI === localNPOI) {
            console.debug(
              `✅ POIs match for subgraphDeployment ${subgraphDeployment} on block ${
                block - 8
              }.`.green
            );
          } else {
            //Q: is expensive query definitely the way to go? what if attacker purchase a few of these queries, could it lead to dispute?
            //But I guess they cannot specifically buy as queries go through ISA
            console.warn(
              `❌ POIS do not match, updating cost model to block off incoming queries`
                .red
            );
            // Cost model schema used byte32 representation of the deployment hash
            divergedDeployment.push(
              Buffer.from(bs58.decode(subgraphDeployment))
                .toString("hex")
                .replace("1220", "0x")
            );
          }
        } else {
          console.log(
            `Could not find entries for subgraphDeployment ${subgraphDeployment} in remote nPOIs. Continuing...`
              .red
          );
        }
      });

      // Handle POI divergences from the highest stake weight nPOIs
      const defaultModel = "default => 100000;";
      // console.log(
      //   `⚠️ Handle POI divergences by setting a crazy high cost model to avoid query traffic`
      //     .red,
      //   { divergedDeployment, defaultModel }
      // );
      //Idea: parallize, move to earlier when first no match, or new query variant in indexer management cost model schema
      divergedDeployment.map(async (deployment) => {
        await updateCostModel(indexerClient, {
          deployment,
          model: defaultModel,
          variables: null,
        });
      });

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
