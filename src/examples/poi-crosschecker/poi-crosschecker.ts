import { Observer } from "../../observer";
import { Messenger } from "../../messenger";
import { EthClient } from "../../ethClient";
import { request, gql } from "graphql-request";
import "dotenv/config";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const protobuf = require("protobufjs");

const run = async () => {
  const observer = new Observer();
  const messenger = new Messenger();
  const ethClient = new EthClient();

  await observer.init();
  await messenger.init();

  // TODO: Move topic generation to client
  const topic = "/my-cool-app/123/my-use-case/proto";

  const handler = (msg: Uint8Array) => {
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
      });

      const { timestamp, blockNumber, subgraph, nPOI } = message;
      console.info(`/nA new message has been received!\nTimestamp: ${timestamp}\nBlock number: ${blockNumber}\nSubgraph (ipfs hash): ${subgraph}'\nnPOI: ${nPOI}/n`);
    });
  };
  observer.observe("/my-cool-app/123/my-use-case/proto", handler);

  const { provider } = ethClient;

  type Allocation = {
    subgraphDeployment: {
      id: string,
      ipfsHash: string
    }
  }

  type AllocationsResponse = {
    indexer: {
      allocations: Allocation[]
    }
  }

  const allocationsQuery = gql`
  {
    indexer(id:"${process.env.INDEXER_ADDRESS}", subgraphError:deny){
      allocations {
        subgraphDeployment {
          id,
          ipfsHash
        }
      }
    }
  }
`

  provider.on("block", async block => {
    if (block % 5 === 0) {

      if (!process.env.TEST_RUN) {
        const allocationsResponseRaw = await request('https://gateway.thegraph.com/network', allocationsQuery);
        const allocationsResponse: AllocationsResponse = JSON.parse(JSON.stringify(allocationsResponseRaw));
        const allocations = allocationsResponse.indexer.allocations;

        for (let i = 0; i < allocations.length; i++) {
          const poiQuery = gql`
          {
            proofOfIndexing(
              subgraph:"${allocations[i].subgraphDeployment.ipfsHash}",
              blockNumber:${block},
              blockHash: "0x996e00f11949c50040a93356d7203d16ca480da8c0a35eda8a1e2bd02356ef3f",
              indexer: "0x0000000000000000000000000000000000000000"
            ) 
          }
        `
          const poiResponse = await request('http://localhost:8030/graphql', poiQuery);

          const message = {
            timestamp: new Date().getTime(),
            blockNumber: block - 5,
            subgraph: allocations[i].subgraphDeployment.ipfsHash,
            nPOI: poiResponse.proofOfIndexing,
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
      } else {
        const blockObject = await provider.getBlock(block - 5);

        const poiQuery = gql`
          {
            proofOfIndexing(
              subgraph:"${process.env.TEST_SUBGRAPH}",
              blockNumber:${block - 5},
              blockHash: "${blockObject.hash}",
              indexer: "0x0000000000000000000000000000000000000000"
            ) 
          }
        `
        const poiResponse = await request('http://localhost:8030/graphql', poiQuery);

        const message = {
          timestamp: new Date().getTime(),
          blockNumber: block - 5,
          subgraph: process.env.TEST_SUBGRAPH,
          nPOI: poiResponse.proofOfIndexing,
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
  })
};

run().then().catch(err => {
  console.error(`Oh no! An error occurred: ${err.message}`);
  process.exit(1);
});
