import { ClientManager } from "../../ethClient";
import { Messenger } from "../../messenger";
import { Observer } from "../../observer";

declare const ETH_NODE: string;
declare const RADIO_OPERATOR_PRIVATE_KEY: string;
declare const NETWORK_URL: string;
declare const GRAPH_NODE_HOST: string;
declare const INDEXER_MANAGEMENT_SERVER: string;
declare const REGISTRY_SUBGRAPH: string;

let messenger: Messenger;
let observer: Observer;
let block: { number: number; hash: string };
let clientManager: ClientManager;
let rawMessage_okay: { nPOI: string; subgraph: string };
let types: Array<{
  name: string;
  type: string;
}>;

const setup = async () => {
  jest.spyOn(console, "log").mockImplementation(jest.fn());
  jest.spyOn(console, "warn").mockImplementation(jest.fn());
  jest.spyOn(console, "error").mockImplementation(jest.fn());
  jest.spyOn(console, "info").mockImplementation(jest.fn());
  jest.spyOn(console, "debug").mockImplementation(jest.fn());

  messenger = new Messenger();
  observer = new Observer();

  clientManager = new ClientManager({
    ethNodeUrl: `http://${ETH_NODE}`,
    operatorPrivateKey: RADIO_OPERATOR_PRIVATE_KEY,
    registry: REGISTRY_SUBGRAPH,
    graphNodeStatus: `http://${GRAPH_NODE_HOST}:8030/graphql`,
    indexerManagementServer: `http://${INDEXER_MANAGEMENT_SERVER}`,
    graphNetworkUrl: NETWORK_URL,
  });

  await messenger.init(clientManager);
  await observer.init(clientManager);

  // Mocks
  Date.now = jest.fn(() => new Date().getTime() - 3_500_000);
  block = {
    number: 1,
    hash: "0x0001",
  };
  observer.clientManager.ethClient.buildBlock = jest.fn(async (number) => {
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
      const encodedMessage = await messenger.writeMessage({
        radioPayload: rawMessage_okay,
        types,
        block,
      });
      expect(encodedMessage).toBeDefined();

      const message = observer._decodeMessage(encodedMessage, types);

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
          await messenger.writeMessage({
            radioPayload: rawMessage_bad,
            types,
            block,
          })
      ).rejects.toThrowError(
        `Cannot write and encode the message, check formatting`
      );
    });

    test("Gossip agent registry check", async () => {
      const operatorAddress = clientManager.ethClient
        .getAddress()
        .toLowerCase();
      const indexerAddress = await observer.radioFilter.isOperatorOf(
        observer.clientManager.registry,
        operatorAddress
      );
      expect(indexerAddress).toBeDefined();
    });

    // // test the observer
    test("Observer prepare attestations", async () => {
      const encodedMessage = await messenger.writeMessage({
        radioPayload: rawMessage_okay,
        types,
        block,
      });
      // first message always fails
      expect(
        await observer.readMessage({
          msg: encodedMessage,
          topic: "topic",
          types,
        })
      ).toBeUndefined();

      // later message with a higher nonce...
      Date.now = jest.fn(() => new Date().getTime() - 3_400_000);
      const encodedMessage2 = await messenger.writeMessage({
        radioPayload: rawMessage_okay,
        types,
        block,
      });
      expect(
        await observer.readMessage({
          msg: encodedMessage2,
          topic: "topic",
          types,
        })
      ).toBeDefined();

      // tries to inject to the past
      Date.now = jest.fn(() => new Date().getTime() - 7_200_000);
      const encodedMessage3 = await messenger.writeMessage({
        radioPayload: rawMessage_okay,
        types,
        block,
      });
      expect(
        await observer.readMessage({
          msg: encodedMessage3,
          topic: "topic",
          types,
        })
      ).toBeUndefined();
    });
  });
});
