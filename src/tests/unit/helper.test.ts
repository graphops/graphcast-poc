// import { ClientManager } from "../../ethClient";
// import { Messenger } from "../../messenger";
// import {
//   NPOIMessage,
//   prepareAttestation,
// } from "../../examples/poi-crosschecker/utils";
// import { Observer } from "../../observer";

// let messenger: Messenger;
// let observer: Observer;
// let block: { number: number; hash: string };
// let clientManager: ClientManager;
// let rawMessage_okay: { nPOI: string; subgraph: string };
// const setup = async () => {
//   jest.spyOn(console, "log").mockImplementation(jest.fn());
//   jest.spyOn(console, "warn").mockImplementation(jest.fn());
//   jest.spyOn(console, "error").mockImplementation(jest.fn());
//   jest.spyOn(console, "info").mockImplementation(jest.fn());
//   jest.spyOn(console, "debug").mockImplementation(jest.fn());

//   messenger = new Messenger();
//   observer = new Observer();

//   // TODO: Change back to eth node when Basilisk is healthy
//   clientManager = new ClientManager({
//     operatorPrivateKey: process.env.RADIO_OPERATOR_PRIVATE_KEY,
//     infuraApiKey: process.env.INFURA_API_KEY,
//     infuraNetwork: "goerli",
//     registry: process.env.REGISTRY_SUBGRAPH,
//     graphNodeStatus: `http://${process.env.GRAPH_NODE_HOST}:8030/graphql`,
//     indexerManagementServer: `http://${process.env.INDEXER_MANAGEMENT_SERVER}`,
//     graphNetworkUrl: process.env.NETWORK_URL,
//   });

//   await messenger.init(clientManager);
//   await observer.init(clientManager);

//   // Mocks
//   Date.now = jest.fn(() => new Date().getTime() - 3_500_000);
//   block = {
//     number: 1,
//     hash: "0x0001",
//   };
//   observer.clientManager.ethClient.buildBlock = jest.fn(async (number) => {
//     return {
//       number: number,
//       hash: "0x000" + number,
//     };
//   });

//   rawMessage_okay = {
//     subgraph: "Qmaaa",
//     nPOI: "poi0",
//   };
// };

// describe("Messenger and Observer helpers", () => {
//   beforeAll(setup);
//   describe("Write and Observe", () => {
//     test("write and observe a message - success", async () => {
//       const encodedMessage = await messenger.writeMessage(
//         NPOIMessage,
//         rawMessage_okay,
//         block
//       );
//       expect(encodedMessage).toBeDefined();

//       // wanted to test calling the waku node but going to leave for integration tests

//       const message = observer.readMessage(encodedMessage, NPOIMessage);
//       expect(Number(message.blockNumber)).toEqual(block.number);
//       expect(message.nPOI).toEqual(rawMessage_okay.nPOI);
//     });

//     test("write a message - wrong protobuf format", async () => {
//       const rawMessage_bad = {
//         deployment: "withoutPOI",
//       };
//       await expect(async () =>
//         messenger.writeMessage(NPOIMessage, rawMessage_bad, block)
//       ).rejects.toThrowError(
//         `Cannot write and encode the message, check formatting`
//       );
//     });

//     test("read a message - wrong protobuf format", async () => {
//       const encodedMessage = await messenger.writeMessage(
//         NPOIMessage,
//         rawMessage_okay,
//         block
//       );
//       expect(
//         observer.readMessage(encodedMessage, "NPOIMessage")
//       ).toBeUndefined();
//     });

//     test("Gossip agent registry check", async () => {
//       const operatorAddress = clientManager.ethClient.getAddress().toLowerCase();
//       const indexerAddress = await observer.radioFilter.isOperatorOf(
//         observer.clientManager.registry,
//         operatorAddress
//       );
//       expect(indexerAddress).toBeDefined();
//     });

//     // test the observer
//     test("Observer prepare attestations", async () => {
//       const encodedMessage = await messenger.writeMessage(
//         NPOIMessage,
//         rawMessage_okay,
//         block
//       );
//       // first message always fails
//       await expect(
//         prepareAttestation(
//           observer.readMessage(encodedMessage, NPOIMessage),
//           NPOIMessage,
//           observer
//         )
//       ).resolves.toBeUndefined();

//       // later message with a higher nonce...
//       Date.now = jest.fn(() => new Date().getTime() - 3_400_000);
//       const encodedMessage2 = await messenger.writeMessage(
//         NPOIMessage,
//         rawMessage_okay,
//         block
//       );
//       await expect(
//         prepareAttestation(
//           NPOIMessage,
//           observer.readMessage(encodedMessage2, NPOIMessage),
//           observer
//         )
//       ).resolves.toBeDefined();

//       // tries to inject to the past
//       Date.now = jest.fn(() => new Date().getTime() - 7_200_000);
//       const encodedMessage3 = await messenger.writeMessage(
//         NPOIMessage,
//         rawMessage_okay,
//         block
//       );
//       expect(
//         prepareAttestation(
//           NPOIMessage,
//           observer.readMessage(encodedMessage3, NPOIMessage),
//           observer
//         )
//       ).resolves.toBeUndefined();
//     });
//   });
// });
