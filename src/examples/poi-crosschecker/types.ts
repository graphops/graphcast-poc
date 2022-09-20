export type IndexerStakeResponse = {
    indexer: {
      stakedTokens: bigint;
    };
  };
  
  export type Dispute = {
    id: string;
    status: string;
    tokensSlashed: bigint;
  };
  
  export type CostModel = {
    deployment: string;
    model: string;
    variables?: string;
  };
  