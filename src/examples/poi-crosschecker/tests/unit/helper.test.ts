import { createLogger } from "@graphprotocol/common-ts";
import { ClientManager } from "../../../../radio-clients/clientManager";
import { GossipAgent } from "./../../../../radio-clients/gossipAgent";

declare const ETH_NODE: string;
declare const RADIO_OPERATOR_PRIVATE_KEY: string;
declare const NETWORK_SUBGRAPH: string;
declare const GRAPH_NODE: string;
declare const INDEXER_MANAGEMENT_SERVER: string;
declare const REGISTRY_SUBGRAPH: string;

let block: { number: number; hash: string };
let gossipAgent: GossipAgent;
let rawMessage_okay: { nPOI: string; subgraph: string };
let types: Array<{
  name: string;
  type: string;
}>;

const setup = async () => {
  jest.spyOn(console, "error").mockImplementation(jest.fn());
  const logger = createLogger({
    name: `poi-crosschecker`,
    async: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    level: "fatal",
  });

  const clientManager = new ClientManager({
    operatorPrivateKey: process.env.RADIO_OPERATOR_PRIVATE_KEY,
    ethNodeUrl: process.env.ETH_NODE,
    registry: process.env.REGISTRY_SUBGRAPH,
    graphNodeStatus: process.env.GRAPH_NODE,
    indexerManagementServer: process.env.INDEXER_MANAGEMENT_SERVER,
    graphNetworkUrl: process.env.NETWORK_SUBGRAPH,
  });

  gossipAgent = new GossipAgent(logger, clientManager);
  await gossipAgent.init();

  // Mocks
  Date.now = jest.fn(() => new Date().getTime() - 3_500_000);
  block = {
    number: 1,
    hash: "0x0001",
  };
  gossipAgent.clientManager.ethClient.buildBlock = jest.fn(async (number) => {
    return {
      number: number,
      hash: "0x000" + number,
    };
  });

  rawMessage_okay = {
    subgraph: "Qmaaa",
    nPOI: "poi0",
  };

  types = [
    { name: "subgraph", type: "string" },
    { name: "nPOI", type: "string" },
  ];
};

describe("Messenger and Observer helpers", () => {
  beforeAll(setup);
  describe("Write and Observe", () => {
    test("write and observe a message - success", async () => {
      const encodedMessage = await gossipAgent.messenger.writeMessage({
        radioPayload: rawMessage_okay,
        types,
        block,
      });
      expect(encodedMessage).toBeDefined();

      const message = gossipAgent.observer._decodeMessage(
        encodedMessage,
        types
      );

      expect(message).toBeDefined();
      expect(Number(message.blockNumber)).toEqual(block.number);
      expect(JSON.parse(message.radioPayload).nPOI).toEqual(
        rawMessage_okay.nPOI
      );
    });

    test("write a message - wrong protobuf format", async () => {
      const rawMessage_bad = {
        deployment: "withoutPOI",
      };
      await expect(
        async () =>
          await gossipAgent.messenger.writeMessage({
            radioPayload: rawMessage_bad,
            types,
            block,
          })
      ).rejects.toThrowError(
        `Cannot write and encode the message, check formatting`
      );
    });

    test("Gossip agent registry check", async () => {
      const operatorAddress = gossipAgent.clientManager.ethClient
        .getAddress()
        .toLowerCase();

      const indexerAddress = await gossipAgent.radioFilter.fetchOperatorIndexer(
        operatorAddress
      );
      expect(indexerAddress).toBeDefined();
    });

    // test the observer
    test("Observer prepare attestations", async () => {
      const encodedMessage = await gossipAgent.messenger.writeMessage({
        radioPayload: rawMessage_okay,
        types,
        block,
      });
      const args = {
        msg: encodedMessage,
        topic: "topic",
        types,
      };

      // can read message
      const openedMessage = await gossipAgent.observer.readMessage(args);
      expect(openedMessage).toHaveProperty(
        "radioPayload",
        JSON.stringify(rawMessage_okay)
      );
      expect(openedMessage).toHaveProperty(
        "sender",
        "0x2bc5349585cbbf924026d25a520ffa9e8b51a39b"
      );
      // but cannot process because it is the first message
      expect(await gossipAgent.processMessage(args)).toBeUndefined();

      // later message with a higher nonce...
      Date.now = jest.fn(() => new Date().getTime() - 3_400_000);
      const encodedMessage2 = await gossipAgent.messenger.writeMessage({
        radioPayload: rawMessage_okay,
        types,
        block,
      });
      expect(
        await gossipAgent.observer.readMessage({
          msg: encodedMessage2,
          topic: "topic",
          types,
        })
      ).toBeDefined();

      // tries to inject to the past
      Date.now = jest.fn(() => new Date().getTime() - 7_200_000);
      const encodedMessage3 = await gossipAgent.messenger.writeMessage({
        radioPayload: rawMessage_okay,
        types,
        block,
      });
      expect(
        await gossipAgent.processMessage({
          msg: encodedMessage3,
          topic: "topic",
          types,
        })
      ).toBeUndefined();
    });
  });
});
