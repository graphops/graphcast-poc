import { EthClient } from "../../ethClient";
import path from "path";
import fetch from "isomorphic-fetch";
import { Messenger } from "../../messenger";
import { NPOIMessage } from "../../examples/poi-crosschecker/poi-helpers";
import { Observer } from "../../observer";
import RadioFilter from "../../radio-common/customs";
import { createClient } from "@urql/core";

declare const ETH_NODE;
declare const RADIO_OPERATOR_PRIVATE_KEY;
declare const REGISTRY_SUBGRAPH;

let messenger;
let observer;
let ethClient;
let block;
let radioFilter;
let registryClient;
const setup = async () => {
  Date.now = jest.fn(() => new Date().getTime() - 3_500_000);

  messenger = new Messenger();
  observer = new Observer();
  ethClient = new EthClient(`http://${ETH_NODE}`, RADIO_OPERATOR_PRIVATE_KEY);
  await messenger.init();
  await observer.init();
  radioFilter = new RadioFilter();
  registryClient = createClient({
    url: REGISTRY_SUBGRAPH,
    fetch,
  });

  block = {
    number: 1,
    hash: "0x0001",
  };
  ethClient.provider.getBlock = jest.fn((number) => {
    return {
      number: number,
      hash: "0x000" + number,
      timestamp: new Date().getTime() - 3_550_000,
    };
  });
};

describe("Messenger and Observer helpers", () => {
  beforeAll(setup);
  describe("Write and Observe", () => {
    test("write and observe a message - success", async () => {
      const rawMessage = {
        subgraph: "Qmaaa",
        nPOI: "poi0",
      };

      const encodedMessage = await messenger.writeMessage(
        ethClient,
        NPOIMessage,
        rawMessage,
        block
      );
      expect(encodedMessage).toBeDefined();

      // wanted to test calling the waku node but going to leave for integration tests

      const message = observer.readMessage(encodedMessage, NPOIMessage);
      expect(Number(message.blockNumber)).toEqual(block.number);
      expect(message.nPOI).toEqual(rawMessage.nPOI);
    });

    test("write a message - wrong protobuf format", async () => {
      const rawMessage = {
        deployment: "withoutPOI",
      };

      await expect(async () => {
        await messenger.writeMessage(ethClient, NPOIMessage, rawMessage, block);
      }).rejects.toThrowError(
        `Cannot write and encode the message, check formatting`
      );
    });

    test("read a message - wrong protobuf format", async () => {
      const message = {
        subgraph: "Qmaaa",
        nPOI: "poi0",
      };

      const encodedMessage = await messenger.writeMessage(
        ethClient,
        NPOIMessage,
        message,
        block
      );
      expect(observer.readMessage(encodedMessage)).toBeUndefined();
    });

    test("Gossip agent registry check", async () => {
      const operatorAddress = ethClient.getAddress().toLowerCase();
      const indexerAddress = await radioFilter.isOperatorOf(
        registryClient,
        operatorAddress
      );
      expect(indexerAddress).toBeDefined();
    });

    // test the observer
    test("Observer prepare attestations", async () => {
      const rawMessage = {
        subgraph: "Qmaaa",
        nPOI: "poi0",
      };

      const encodedMessage = await messenger.writeMessage(
        ethClient,
        NPOIMessage,
        rawMessage,
        block
      );
      const message = observer.readMessage(encodedMessage, NPOIMessage);

      // first message always fails
      const attestation = await observer.prepareAttestation(
        message,
        NPOIMessage,
        ethClient.provider,
        radioFilter,
        registryClient
      );
      expect(attestation).toBeUndefined();

      // later message with a higher nonce...
      Date.now = jest.fn(() => new Date().getTime() - 3_400_000);
      const encodedMessage2 = await messenger.writeMessage(
        ethClient,
        NPOIMessage,
        rawMessage,
        block
      );
      const message2 = observer.readMessage(encodedMessage2, NPOIMessage);
      const attestation2 = await observer.prepareAttestation(
        message2,
        NPOIMessage,
        ethClient.provider,
        radioFilter,
        registryClient
      );
      expect(attestation2).toBeDefined();

      // tries to inject to the past
      Date.now = jest.fn(() => new Date().getTime() - 7_200_000);
      const encodedMessage3 = await messenger.writeMessage(
        ethClient,
        NPOIMessage,
        rawMessage,
        block
      );
      const message3 = observer.readMessage(encodedMessage3, NPOIMessage);
      const attestation3 = await observer.prepareAttestation(
        message3,
        NPOIMessage,
        ethClient.provider,
        radioFilter,
        registryClient
      );
      expect(attestation3).toBeUndefined();
    });
  });
});
