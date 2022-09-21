export type IndexerStakeResponse = {
  indexer: { Dispute: Dispute; stakedTokens: bigint };
};

export type Dispute = {
  id: string;
  status: string;
  tokensSlashed: bigint;
};

export type BlockPointer = { number: number; hash: string };
