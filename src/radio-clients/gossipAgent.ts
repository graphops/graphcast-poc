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

  constructor(logger: Logger, clientManager: ClientManager) {
    this.messenger = new Messenger();
    this.observer = new Observer();
    this.logger = logger;
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

    return this.radioFilter.fetchOperatorIndexer(
      this.clientManager.ethClient.getAddress().toLowerCase()
    );
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
      nonce
    };
  }
}
