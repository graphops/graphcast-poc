import { Messenger } from "./messenger";
import { Observer } from "./observer";
import { Logger } from "@graphprotocol/common-ts";
import { ClientManager } from "./clientManager";
import { Waku } from "js-waku";
import { Client } from "@urql/core";
import { ReadMessageArgs } from "../radio-common/types";
import RadioFilter from "../radio-common/customs";

export class GossipAgent {
  messenger: Messenger;
  observer: Observer;
  logger: Logger;
  clientManager: ClientManager;
  registry: Client;
  radioFilter: RadioFilter;
  waku?: Waku;
  operator?: string;
  indexer?: string;

  constructor(logger: Logger, clientManager: ClientManager) {
    this.messenger = new Messenger();
    this.observer = new Observer();
    this.logger = logger.child({ component: "gossipAgent" });
    this.clientManager = clientManager;

    this.registry = this.clientManager.registry;
    this.radioFilter = new RadioFilter(
      logger,
      clientManager.networkSubgraph,
      this.registry
    );
  }

  async init() {
    this.waku = await Waku.create({
      bootstrap: {
        default: true,
      },
    });
    this.messenger.init(this.logger, this.waku, this.clientManager);
    await this.observer.init(this.logger, this.waku, this.clientManager);

    this.operator = this.clientManager.ethClient.getAddress().toLowerCase();
    this.indexer = await this.radioFilter.fetchOperatorIndexer(this.operator);
    return this.indexer;
  }

  async processMessage(args: ReadMessageArgs) {
    const { radioPayload, nonce, blockNumber, blockHash, sender } =
      await this.observer.readMessage(args);

    const block = await this.clientManager.ethClient.buildBlock(
      Number(blockNumber)
    );

    const stakeWeight = await this.radioFilter.messageValidity({
      sender,
      topic: args.topic,
      nonce: Number(nonce),
      blockHash,
      block,
    });
    if (stakeWeight <= 0) {
      return;
    }

    this.logger.debug(`✅ Valid message!`, { sender, nonce, blockNumber });

    return {
      radioPayload,
      blockNumber,
      sender,
      stakeWeight,
      nonce,
    };
  }

  async establishTopics(radio_application, handler, fetch?) {
    // can generalize fetch or make it lambda
    const topics = fetch
      ? await fetch(
          this.logger,
          this.clientManager.networkSubgraph,
          this.indexer
        )
      : [];

    if (process.env.TEST_TOPIC) {
      topics.push(process.env.TEST_TOPIC);
    }

    if (topics.length > 0) {
      this.observer.observe(
        topics.map((topic: string) => {
          const graphcastTopic = `/graphcast${
            process.env.TEST_ENVIRONMENT ? "-test" : ""
          }/0/${radio_application}/${topic}/proto`;

          return graphcastTopic;
        }),
        handler
      );
    } else {
      const graphcastTopic = `/graphcast${
        process.env.TEST_ENVIRONMENT ? "-test" : ""
      }/0/${radio_application}/proto`;
      this.observer.observe([graphcastTopic], handler);
    }

    return topics;
  }
}
