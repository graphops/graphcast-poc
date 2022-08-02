import { Observer } from "../../observer";
import { Messenger } from "../../messenger";
import { EthClient } from "../../ethClient";
import { request } from "graphql-request";
import { Attestation, IndexerResponse, IndexerStakeResponse } from "./types";
import {
  indexerStakeQuery,
  indexerAllocationsQuery,
  poiQuery,
} from "./queries";
import { printNPOIs } from "../../utils";
import "colors";
import "dotenv/config";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const protobuf = require("protobufjs");

const run = async () => {
  const observer = new Observer();
  const messenger = new Messenger();
  const ethClient = new EthClient();

  await observer.init();
  await messenger.init();

  const topic = "poi-crosschecker";

  const nPOIs: Map<string, Map<string, Attestation[]>> = new Map();
  const myNPOIs: Map<string, Map<string, string>> = new Map();

  const handler = (msg: Uint8Array) => {
    printNPOIs(nPOIs);
    console.log("👀 My nPOIs:".blue);
    console.log(myNPOIs);

    protobuf.load("./proto/NPOIMessage.proto", async (err, root) => {
      if (err) {
        throw err;
      }

      const Message = root.lookupType("gossip.NPOIMessage");
      const decodedMessage = Message.decode(msg);

      const message = Message.toObject(decodedMessage, {
        timestamp: Number,
        blockNumber: Number,
        subgraph: String,
        nPOI: String,
        sender: String,
      });

      const { timestamp, blockNumber, subgraph, nPOI, sender } = message;
      console.info(
        `\n📮 A new message has been received!\nTimestamp: ${timestamp}\nBlock number: ${blockNumber}\nSubgraph (ipfs hash): ${subgraph}\nnPOI: ${nPOI}\nSender: ${sender}\n`
          .green
      );

      const indexerStakeResponse: IndexerStakeResponse = await request(
        "https://gateway.thegraph.com/network",
        indexerStakeQuery
      );

      if (nPOIs.has(subgraph)) {
        const attestation: Attestation = {
          nPOI,
          indexerAddress: sender,
          stake: process.env.TEST_RUN
            ? BigInt(Math.round(Math.random() * 1000))
            : indexerStakeResponse.indexer.stakedTokens,
        };

        const blocks = nPOIs.get(subgraph);

        if (blocks.has(blockNumber.toString())) {
          const attestations = [...blocks.get(blockNumber.toString())];
          attestations.push(attestation);
          blocks.set(blockNumber.toString(), attestations);
        } else {
          blocks.set(blockNumber.toString(), [attestation]);
        }
      } else {
        const attestation: Attestation = {
          nPOI,
          indexerAddress: sender,
          stake: process.env.TEST_RUN
            ? BigInt(Math.round(Math.random() * 1000))
            : indexerStakeResponse.indexer.stakedTokens,
        };

        const blocks = new Map();
        blocks.set(blockNumber.toString(), [attestation]);
        nPOIs.set(subgraph, blocks);
      }
    });
  };

  observer.observe("poi-crosschecker", handler);

  const { provider } = ethClient;

  const getNPOIs = async (block: number) => {
    const blockObject = await provider.getBlock(block);

    if (process.env.TEST_RUN) {
      const poiResponse = await request(
        `http://${process.env.GRAPH_NODE_HOST}:8030/graphql`,
        poiQuery(process.env.TEST_SUBGRAPH, block, blockObject.hash)
      );

      const message = {
        timestamp: new Date().getTime(),
        blockNumber: block,
        subgraph: process.env.TEST_SUBGRAPH,
        nPOI: poiResponse.proofOfIndexing,
        sender: process.env.INDEXER_ADDRESS,
      };

      if (
        poiResponse.proofOfIndexing == undefined ||
        poiResponse.proofOfIndexing == null
      ) {
        console.log(
          `😔 Could not get nPOI for subgraph ${process.env.TEST_SUBGRAPH} and block ${block}. Please check if your node has fully synced the subgraph.`
            .red
        );
      } else {
        protobuf.load("./proto/NPOIMessage.proto", async (err, root) => {
          if (err) {
            throw err;
          }

          if (!myNPOIs.has(process.env.TEST_SUBGRAPH)) {
            const blocks = new Map();
            blocks.set(block.toString(), poiResponse.proofOfIndexing);
            myNPOIs.set(process.env.TEST_SUBGRAPH, blocks);
          } else {
            const blocks = myNPOIs.get(process.env.TEST_SUBGRAPH);
            blocks.set(block.toString(), poiResponse.proofOfIndexing);
            myNPOIs.set(process.env.TEST_SUBGRAPH, blocks);
          }

          const Message = root.lookupType("gossip.NPOIMessage");
          const encodedMessage = Message.encode(message).finish();
          await messenger.sendMessage(encodedMessage, topic);
        });
      }
    } else {
      const indexerResponse: IndexerResponse = await request(
        "https://gateway.thegraph.com/network",
        indexerAllocationsQuery
      );
      const allocations = indexerResponse.indexer.allocations;

      for (let i = 0; i < allocations.length; i++) {
        const subgraph = allocations[i].subgraphDeployment.ipfsHash;

        const poiResponse = await request(
          `http://${process.env.GRAPH_NODE_HOST}:8030/graphql`,
          poiQuery(subgraph, block, blockObject.hash)
        );

        const message = {
          timestamp: new Date().getTime(),
          blockNumber: block,
          subgraph,
          nPOI: poiResponse.proofOfIndexing,
          sender: process.env.INDEXER_ADDRESS,
        };

        if (
          poiResponse.proofOfIndexing == undefined ||
          poiResponse.proofOfIndexing == null
        ) {
          console.log(
            `😔 Could not get nPOI for subgraph ${subgraph} and block ${block}. Please check if your node has fully synced the subgraph.`
              .red
          );
        } else {
          protobuf.load("./proto/NPOIMessage.proto", async (err, root) => {
            if (err) {
              throw err;
            }

            if (!myNPOIs.has(subgraph)) {
              const blocks = new Map();
              blocks.set(block.toString(), poiResponse.proofOfIndexing);
              myNPOIs.set(subgraph, blocks);
            } else {
              const blocks = myNPOIs.get(subgraph);
              blocks.set(block.toString(), poiResponse.proofOfIndexing);
              myNPOIs.set(subgraph, blocks);
            }

            const Message = root.lookupType("gossip.NPOIMessage");
            const encodedMessage = Message.encode(message).finish();
            await messenger.sendMessage(encodedMessage, topic);
          });
        }
      }
    }
  };

  let compareBlock = 0;
  provider.on("block", async (block) => {
    console.log(`🔗 ${block}`);

    if (block % 5 === 0) {
      // Going 5 blocks back as a buffer to make sure the node is fully synced
      getNPOIs(block - 5);
      compareBlock = block + 3;
    }

    if (block == compareBlock) {
      console.log("🔬 Comparing nPOIs...".blue);

      myNPOIs.forEach((blocks, subgraph) => {
        const remoteBlocks = nPOIs.get(subgraph);

        if (
          remoteBlocks == null &&
          remoteBlocks == undefined &&
          remoteBlocks.size === 0
        ) {
          console.log(
            `Could not find entries for subgraph ${subgraph} in remote nPOIs.`
              .red
          );
        } else {
          const attestations = remoteBlocks.get((block - 8).toString());

          console.log(
            `📒 Attestations for subgraph ${subgraph} on block ${block - 8}:`
              .blue
          );
          console.log(attestations);

          const sorted = attestations.sort((a, b) => {
            if (a.stake > b.stake) {
              return 1;
            } else if (a.stake < b.stake) {
              return -1;
            } else {
              return 0;
            }
          });

          const topAttestation = sorted[0];
          const myNPOI = blocks.get((block - 8).toString());

          if (topAttestation.nPOI === myNPOI) {
            console.log(
              `✅ POIs match for subgraph ${subgraph} on block ${block - 8}.`
                .green
            );
          } else {
            console.log(
              `❌ POIS do not match for subgraph ${subgraph} on block ${
                block - 8
              }. Local POI is ${myNPOI} and remote POI tied to the most stake is ${
                topAttestation.nPOI
              }.`
            );
          }
        }
      });

      nPOIs.clear();
      myNPOIs.clear();
    }
  });
};

run()
  .then()
  .catch((err) => {
    console.error(`❌ Oh no! An error occurred: ${err.message}`.red);
    process.exit(1);
  });
