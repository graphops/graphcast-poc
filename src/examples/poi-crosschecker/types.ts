export type Allocation = {
  subgraphDeployment: {
    id: string;
    ipfsHash: string;
  };
};

export type Indexer = {
  allocations: Allocation[];
};

export type IndexerResponse = {
  indexer: Indexer;
};

export type CostModel = {
  deployment: string;
  model: string;
  variables?: string;
};

export type NPOIRecord = {
  subgraph: string;
  block: number;
  nPOI: string;
  operator: string;
  stakeWeight: bigint;
};
