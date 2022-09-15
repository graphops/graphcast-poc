import { ClientManager } from "../../ethClient";
import { Messenger } from "../../messenger";
import { NPOIMessage } from "../../examples/poi-crosschecker/poi-helpers";
import { Observer } from "../../observer";

declare const ETH_NODE: string;
declare const RADIO_OPERATOR_PRIVATE_KEY: string;
declare const NETWORK_URL: string;
declare const GRAPH_NODE_HOST: string;
declare const INDEXER_MANAGEMENT_SERVER: string;
declare const REGISTRY_SUBGRAPH: string;

let messenger: Messenger;
let observer: Observer;
let block: { number: number; hash: string; };
let clientManager: ClientManager;
let rawMessage_okay: { nPOI: string; subgraph: string; };
const setup = async () => {
  jest.spyOn(console, 'log').mockImplementation(jest.fn());
  jest.spyOn(console, 'warn').mockImplementation(jest.fn());
  jest.spyOn(console, 'error').mockImplementation(jest.fn());
  jest.spyOn(console, 'info').mockImplementation(jest.fn());
  jest.spyOn(console, 'debug').mockImplementation(jest.fn());

  messenger = new Messenger();
  observer = new Observer();
  clientManager = new ClientManager(
    `http://${ETH_NODE}`,
    RADIO_OPERATOR_PRIVATE_KEY,
    NETWORK_URL,
    `http://${GRAPH_NODE_HOST}:8030/graphql`,
    `http://${INDEXER_MANAGEMENT_SERVER}`,
    REGISTRY_SUBGRAPH
  );

  await messenger.init(clientManager);
  await observer.init(clientManager);

  // Mocks
  Date.now = jest.fn(() => new Date().getTime() - 3_500_000);
  block = {
    number: 1,
    hash: "0x0001",
  };
  observer.clientManager.ethNode.buildBlock = jest.fn(async (number) => {
    return {
      number: number,
      hash: "0x000" + number,
    };
  });

  rawMessage_okay = {
    subgraph: "Qmaaa",
    nPOI: "poi0",
  };
};

describe("Messenger and Observer helpers", () => {
  beforeAll(setup);
  describe("Write and Observe", () => {
    test("write and observe a message - success", async () => {
      const encodedMessage = await messenger.writeMessage(
        NPOIMessage,
        rawMessage_okay,
        block
      );
      expect(encodedMessage).toBeDefined();

      // wanted to test calling the waku node but going to leave for integration tests

      const message = observer.readMessage(encodedMessage, NPOIMessage);
      expect(Number(message.blockNumber)).toEqual(block.number);
      expect(message.nPOI).toEqual(rawMessage_okay.nPOI);
    });

    test("write a message - wrong protobuf format", async () => {
      const rawMessage_bad = {
        deployment: "withoutPOI",
      };
      await expect(async () =>
        messenger.writeMessage(NPOIMessage, rawMessage_bad, block)
      ).rejects.toThrowError(
        `Cannot write and encode the message, check formatting`
      );
    });

    test("read a message - wrong protobuf format", async () => {
      const encodedMessage = await messenger.writeMessage(
        NPOIMessage,
        rawMessage_okay,
        block
      );
      expect(observer.readMessage(encodedMessage, "NPOIMessage")).toBeUndefined();
    });

    test("Gossip agent registry check", async () => {
      const operatorAddress = clientManager.ethNode.getAddress().toLowerCase();
      const indexerAddress = await observer.radioFilter.isOperatorOf(
        observer.clientManager.registry,
        operatorAddress
      );
      expect(indexerAddress).toBeDefined();
    });

    // test the observer
    test("Observer prepare attestations", async () => {
      const encodedMessage = await messenger.writeMessage(
        NPOIMessage,
        rawMessage_okay,
        block
      );
      // first message always fails
      await expect(
        observer.prepareAttestation(
          observer.readMessage(encodedMessage, NPOIMessage),
          NPOIMessage
        )
      ).resolves.toBeUndefined();

      // later message with a higher nonce...
      Date.now = jest.fn(() => new Date().getTime() - 3_400_000);
      const encodedMessage2 = await messenger.writeMessage(
        NPOIMessage,
        rawMessage_okay,
        block
      );
      await expect(
        observer.prepareAttestation(
          observer.readMessage(encodedMessage2, NPOIMessage),
          NPOIMessage
        )
      ).resolves.toBeDefined();

      // tries to inject to the past
      Date.now = jest.fn(() => new Date().getTime() - 7_200_000);
      const encodedMessage3 = await messenger.writeMessage(
        NPOIMessage,
        rawMessage_okay,
        block
      );
      expect(
        observer.prepareAttestation(
          observer.readMessage(encodedMessage3, NPOIMessage),
          NPOIMessage
        )
      ).resolves.toBeUndefined();
    });
  });
});
