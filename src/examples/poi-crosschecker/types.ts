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
