export type Allocation = {
    subgraphDeployment: {
        id: string,
        ipfsHash: string
    }
}

export type Indexer = {
    allocations: Allocation[],
}

export type IndexerResponse = {
    indexer: Indexer,
};

export type IndexerStakeResponse = {
    indexer: {
        stakedTokens: bigint
    },
};

export type Attestation = {
    nPOI: string,
    indexerAddress: string,
    stake: bigint,
}
