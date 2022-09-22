import { Client } from "@urql/core";

export type RadioMessage = {
  payload: Uint8Array;
  topic: string;
};

export type ReadMessageArgs = {
  msg: Uint8Array;
  topic: string;
  types: Array<{
    name: string;
    type: string;
  }>;
};

export type MessageValidityArgs = {
  client: Client;
  sender: string;
  topic: string;
  nonce: number;
  blockHash: string;
  block: BlockPointer;
};

export type ClientManagerArgs = {
  ethNodeUrl?: string;
  operatorPrivateKey: string;
  graphNetworkUrl: string;
  infuraApiKey?: string;
  infuraNetwork?: string;
  registry: string;
  graphNodeStatus: string;
  indexerManagementServer: string;
};

export type IndexerStakeResponse = {
  indexer: { Dispute: Dispute; stakedTokens: bigint };
};

export type Dispute = {
  id: string;
  status: string;
  tokensSlashed: bigint;
};

export type BlockPointer = { number: number; hash: string };
