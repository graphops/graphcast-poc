import { createLogger } from "@graphprotocol/common-ts";
import "dotenv/config";
import { ClientManager } from "../../radio-clients/clientManager";
import { GossipAgent } from "../../radio-clients/gossipAgent";

const RADIO_PAYLOAD_TYPES = [{ name: "content", type: "string" }];
const DOMAIN = "ping-pong";

const logger = createLogger({
  name: DOMAIN,
  async: false,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  level: process.env.logLevel as any,
});

const run = async () => {
  const clientManager = new ClientManager({
    operatorPrivateKey: process.env.RADIO_OPERATOR_PRIVATE_KEY,
    ethNodeUrl: process.env.ETH_NODE,
    registry: process.env.REGISTRY_SUBGRAPH,
    graphNodeStatus: process.env.GRAPH_NODE,
    indexerManagementServer: process.env.INDEXER_MANAGEMENT_SERVER,
    graphNetworkUrl: process.env.NETWORK_SUBGRAPH,
  });

  const gossipAgent = new GossipAgent(logger, clientManager);

  const indexerAddress = await gossipAgent.init();

  logger.info(
    `🔦 Radio operator resolved to indexer address ${indexerAddress}`
  );

  logger.info(`👂 Initialize ping pong Radio with operator status: `, {
    indexerAddress:
      indexerAddress ??
      "Graphcast agent is not registered as an indexer operator",
    topic: DOMAIN,
  });

  const sendMessage = async (radioPayload) => {
    const provider = gossipAgent.clientManager.ethClient.provider;

    const block = await provider.getBlockNumber();
    const blockObject = await provider.getBlock(block);

    logger.info("Sending message with payload: ", radioPayload);

    const encodedMessage = await gossipAgent.messenger.writeMessage({
      radioPayload,
      types: RADIO_PAYLOAD_TYPES,
      block: blockObject,
    });

    await gossipAgent.messenger.sendMessage(encodedMessage, DOMAIN);
  };

  const handler = async (msg: Uint8Array, topic: string) => {
    try {
      logger.info(`📮 A new message has been received! Handling the message`);
      const message = await gossipAgent.processMessage({
        msg,
        topic,
        types: RADIO_PAYLOAD_TYPES,
      });

      logger.info(`Message: `, { message });
      const radioPayload = JSON.parse(message.radioPayload);

      if (radioPayload.content === "Ping") {
        const radioPayload = {
          content: "Pong",
        };

        await sendMessage(radioPayload);
      }
    } catch {
      logger.info(`Failed to handle a message into attestation, moving on`);
    }
  };

  await gossipAgent.establishTopics(DOMAIN, handler);

  gossipAgent.clientManager.ethClient.provider.on("block", async (block) => {
    logger.info(`🔗 Block: ${block}`);

    if (block % 5 === 0) {
      logger.info("Ping pong block!");

      const radioPayload = {
        content: "Ping",
      };

      await sendMessage(radioPayload);
    }
  });
};

run()
  .then()
  .catch((err) => {
    logger.error(`❌ Oh no! An error occurred: ${err.message}`);
    process.exit(1);
  });
