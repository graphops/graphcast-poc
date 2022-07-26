import { Observer } from "../../observer";
import { Messenger } from "../../messenger";
import { EthClient } from "../../ethClient";
import { request } from "graphql-request";
import { Attestation, IndexerResponse, IndexerStakeResponse } from "./types";
import { indexerStakeQuery, indexerAllocationsQuery, poiQuery } from "./queries";
import { attestationExists } from "./utils";
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

  const nPOIs: Map<string, Attestation[]> = new Map();

  const handler = (msg: Uint8Array) => {
    console.log(nPOIs);

    protobuf.load("src/examples/poi-crosschecker/proto/NPOIMessage.proto", async (err, root) => {
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
      console.info(`A new message has been received!\nTimestamp: ${timestamp}\nBlock number: ${blockNumber}\nSubgraph (ipfs hash): ${subgraph}\nnPOI: ${nPOI}\nSender: ${sender}\n`);

      const indexerStakeResponse: IndexerStakeResponse = await request('https://gateway.thegraph.com/network', indexerStakeQuery);

      if (nPOIs.has(subgraph)) {
        if (attestationExists(nPOIs.get(subgraph), sender, nPOI)) {
          console.log(`Attestation with sender address: ${sender} and nPOI: ${nPOI} already exists in the store.`);
        } else {
          const attestation: Attestation = {
            nPOI,
            indexerAddress: sender,
            stake: indexerStakeResponse.indexer.stakedTokens,
          }

          const attestations = nPOIs.get(subgraph);
          attestations.push(attestation);

          nPOIs.set(subgraph, attestations);
        }
      } else {
        const attestation: Attestation = {
          nPOI,
          indexerAddress: sender,
          stake: process.env.TEST_RUN ? BigInt(111) : indexerStakeResponse.indexer.stakedTokens,
        };

        nPOIs.set(subgraph, [attestation]);
      }
    });
  };

  observer.observe("/my-cool-app/123/my-use-case/proto", handler);

  const { provider } = ethClient;

  provider.on("block", async block => {
    if (block % 2 === 0) {
      const blockObject = await provider.getBlock(block - 5);

      if (process.env.TEST_RUN) {
        const poiResponse = await request('http://localhost:8030/graphql', poiQuery(process.env.TEST_SUBGRAPH, block - 5, blockObject.hash));

        const message = {
          timestamp: new Date().getTime(),
          blockNumber: block - 5,
          subgraph: process.env.TEST_SUBGRAPH,
          nPOI: poiResponse.proofOfIndexing,
          // TODO: Randomize this indexer address for testing with a few instances of graph-node ? Or hardcode a different one every time
          sender: "0x0000000000000000000000000000000000000000"
        }

        protobuf.load("src/examples/poi-crosschecker/proto/NPOIMessage.proto", async (err, root) => {
          if (err) {
            throw err;
          }

          const Message = root.lookupType("gossip.NPOIMessage");
          const encodedMessage = Message.encode(message).finish();
          await messenger.sendMessage(encodedMessage, topic);
        });
      } else {
        const indexerResponse: IndexerResponse = await request('https://gateway.thegraph.com/network', indexerAllocationsQuery);
        const allocations = indexerResponse.indexer.allocations;

        for (let i = 0; i < allocations.length; i++) {
          const poiResponse = await request('http://localhost:8030/graphql', poiQuery(allocations[i].subgraphDeployment.ipfsHash, block - 5, blockObject.hash));

          const message = {
            timestamp: new Date().getTime(),
            blockNumber: block - 5,
            subgraph: allocations[i].subgraphDeployment.ipfsHash,
            nPOI: poiResponse.proofOfIndexing,
            sender: process.env.INDEXER_ADDRESS,
          }

          protobuf.load("src/examples/poi-crosschecker/proto/NPOIMessage.proto", async (err, root) => {
            if (err) {
              throw err;
            }

            const Message = root.lookupType("gossip.NPOIMessage");
            const encodedMessage = Message.encode(message).finish();
            await messenger.sendMessage(encodedMessage, topic);
          });
        }
      }
    }
  })
};

run().then().catch(err => {
  console.error(`Oh no! An error occurred: ${err.message}`);
  process.exit(1);
});
