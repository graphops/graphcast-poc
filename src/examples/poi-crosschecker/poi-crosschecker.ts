import { createClient } from "@urql/core";
import fetch from "isomorphic-fetch";
import "colors";
import "dotenv/config";
import { Observer } from "../../observer";
import { Messenger } from "../../messenger";
import { EthClient } from "../../ethClient";
import {
  Attestation,
  IndexerResponse,
  IndexerStakeResponse,
} from "../../radio-common/types";
import {
  fetchAllocations,
  fetchMinStake,
  fetchOperators,
  fetchPOI,
  fetchStake,
} from "../../radio-common/queries";
import { printNPOIs } from "../../utils";
import RadioFilter from "../../radio-common/customs";
// eslint-disable-next-line @typescript-eslint/no-var-requires
const protobuf = require("protobufjs");

const run = async () => {
  const observer = new Observer();
  const messenger = new Messenger();
  const ethClient = new EthClient();

  await observer.init();
  await messenger.init();

  const client = createClient({ url: process.env.NETWORK_URL, fetch });
  const registryClient = createClient({
    url: process.env.REGISTRY_SUBGRAPH,
    fetch,
  });
  const graphNodeEndpoint = `http://${process.env.GRAPH_NODE_HOST}:8030/graphql`;
  const graphClient = createClient({ url: graphNodeEndpoint, fetch });
  const { provider, goerliProvider, registryContract } = ethClient;

  const radioFilter = new RadioFilter();
  // Check self in the registry
  // const operatorStatus = await ethClient.checkRegistry(process.env.INDEXER_ADDRESS, process.env.RADIO_OPERATOR)
  const isOperator = await radioFilter.isOperator(
    client,
    process.env.INDEXER_ADDRESS,
    process.env.RADIO_OPERATOR
  );
  const allocations = await fetchAllocations(
    client,
    process.env.INDEXER_ADDRESS
  );
  const deploymentIPFSs = allocations.map((a) => a.subgraphDeployment.ipfsHash);
  const topics = deploymentIPFSs.map(
    (ipfsHash) => `/graph-gossip/0/poi-crosschecker/${ipfsHash}/proto`
  );
  console.log(
    `\n👂 Initialize POI crosschecker for on-chain allocations with operator status:`
      .green,
    {
      isOperator,
      topics,
    }
  );

  const nPOIs: Map<string, Map<string, Attestation[]>> = new Map();
  const localnPOIs: Map<string, Map<string, string>> = new Map();

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
          timestamp: Number,
          blockNumber: Number,
          subgraph: String,
          nPOI: String,
          sender: String,
        });
      } catch (error) {
        console.error(
          `Protobuf reader could not decode message, assume corrupted`
        );
        return;
      }

      const { timestamp, blockNumber, subgraph, nPOI, sender } = message;
      console.info(
        `\n📮 A new message has been received!\nTimestamp: ${timestamp}\nBlock number: ${blockNumber}\nSubgraph (ipfs hash): ${subgraph}\nnPOI: ${nPOI}\nSender: ${sender}\n`
          .green
      );

      // Message Validity (check registry identity, time, stake, dispute) for which to skip by returning early
      const senderStake = await radioFilter.poiMsgValidity(
        registryClient,
        sender,
        timestamp,
        sender
      );
      if (senderStake <= 0) {
        console.warn(
          `\nMessage considered compromised, intercepting - invalid sender\n`
            .red
        );
        return;
      }

      const attestation: Attestation = {
        nPOI,
        indexerAddress: sender,
        stake: BigInt(BigInt(senderStake)),
      };
      console.debug(`Valid message, caching attestation`, { attestation });
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
        process.env.INDEXER_ADDRESS
      );

      if (localPOI == undefined || localPOI == null) {
        //TODO: SetCostModel for the POI to a ridiculously high price
        unavailableDplymts.push(ipfsHash);
        //Connect to indexer management server - (can build network subgraph from this by allowing local indexer-service to serve
        //Construct setCostModel mutation and send to server, check responses
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
            timestamp: new Date().getTime(),
            blockNumber: block,
            subgraph: ipfsHash,
            nPOI: localPOI,
            sender: process.env.INDEXER_ADDRESS,
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

      localnPOIs.forEach((blocks, subgraph) => {
        const remoteBlocks = nPOIs.get(subgraph);
        if (remoteBlocks && remoteBlocks.size >= 0) {
          const attestations = remoteBlocks.get((block - 8).toString());
          if (!attestations) {
            console.log(
              `No attestations for $(subgraph) on block ${
                block - 8
              } at the moment`
            );
            return;
          }

          console.log(
            `📒 Attestations for subgraph ${subgraph} on block ${block - 8}:`
              .blue,
            {
              attestations,
            }
          );

          const sorted = attestations.sort((a, b) => {
            if (a.stake < b.stake) {
              return 1;
            } else if (a.stake > b.stake) {
              return -1;
            } else {
              return 0;
            }
          });

          const topAttestation = sorted[0];
          console.log(
            `🥇 NPOI backed by the most stake: ${topAttestation.nPOI}`.cyan
          );
          const localNPOI = blocks.get((block - 8).toString());

          if (topAttestation.nPOI === localNPOI) {
            console.log(
              `✅ POIs match for subgraph ${subgraph} on block ${block - 8}.`
                .green
            );
          } else {
            console.log(
              `❌ POIS do not match for subgraph ${subgraph} on block ${
                block - 8
              }. Local POI is ${localNPOI} and remote POI tied to the most stake is ${
                topAttestation.nPOI
              }.`.red
            );
          }
        } else {
          console.log(
            `Could not find entries for subgraph ${subgraph} in remote nPOIs. Continuing...`
              .red
          );
        }
      });

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
