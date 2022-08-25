import { Client } from "@urql/core";
import { gql } from "graphql-tag";
import "colors";
import { Dispute, CostModel } from "./types";

//TODO: condense for better and more efficient query and cache
export const indexerAllocationsQuery = gql`
  query indexer($address: String!) {
    indexer(id: $address) {
      allocations {
        allocatedTokens
        subgraphDeployment {
          id
          ipfsHash
        }
      }
    }
  }
`;

export const indexerStakeQuery = gql`
  query indexer($address: String!) {
    indexer(id: $address) {
      stakedTokens
    }
  }
`;

export const disputeIndexerQuery = gql`
  query disputes($address: String!) {
    disputes(where: { indexer: $address, status_in: [Accepted, Undecided] }) {
      id
      status
      tokensSlashed
    }
  }
`;

export const operatorOfIndexerQuery = gql`
  query gossipOperatorOf($address: String!) {
    graphAccount(id: $address) {
      id
      gossipOperatorOf {
        id
        indexer {
          id
        }
      }
    }
  }
`;

export const indexerOperatorQuery = gql`
  query indexer($address: String!) {
    indexer(id: $address) {
      account {
        gossipOperators {
          id
        }
      }
    }
  }
`;

export const poiQuery = (
  subgraph: string,
  block: number,
  hash: string,
  indexer?: string
) => {
  if (indexer) {
    return gql`
    {
      proofOfIndexing(
        subgraph:"${subgraph}",
        blockNumber:${block},
        blockHash: "${hash}",
        indexer: "${indexer}"
      ) 
    }
    `;
  }
  return gql`
    {
      proofOfIndexing(
        subgraph:"${subgraph}",
        blockNumber:${block},
        blockHash: "${hash}",
      ) 
    }
    `;
};

export async function fetchAllocations(client: Client, address: string) {
  try {
    const result = await client
      .query(indexerAllocationsQuery, { address })
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.indexer.allocations;
  } catch (error) {
    console.warn(`No allocation fetched, check connection and address`);
    return [];
  }
}

export async function fetchDisputes(
  client: Client,
  address: string
): Promise<Dispute[]> {
  try {
    const result = await client
      .query(disputeIndexerQuery, { address })
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.disputes;
  } catch (error) {
    console.warn(`No disputes fetched, assume nothing...?`);
    return [];
  }
}

export async function fetchOperators(
  client: Client,
  address: string
): Promise<string[]> {
  try {
    const result = await client
      .query(indexerOperatorQuery, { address })
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.indexer.account.gossipOperators;
  } catch (error) {
    console.warn(`No operators fetched, assume none`, { error });
    return [];
  }
}

export async function fetchStake(client: Client, address: string) {
  try {
    const result = await client
      .query(indexerStakeQuery, { address })
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.indexer.stakedTokens;
  } catch (error) {
    console.warn(`No stake fetched for indexer ${address}, assuming 0`);
    return 0;
  }
}

export async function fetchOperatorOfIndexers(client: Client, address: string) {
  try {
    const result = await client
      .query(operatorOfIndexerQuery, { address })
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.graphAccount.gossipOperatorOf.map(
      (account) => account.indexer.id
    );
  } catch (error) {
    console.warn(
      `Did not find corresponding indexer address for the gossip operator`
    );
    return null;
  }
}

export async function fetchMinStake(client: Client) {
  try {
    const result = await client
      .query(
        gql`
          {
            graphNetwork(id: "1") {
              minimumIndexerStake
            }
          }
        `
      )
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.graphNetwork.minimumIndexerStake;
  } catch (error) {
    throw new Error(`Failed to fetch minimum indexer stake requirement`);
  }
}

export async function fetchPOI(
  client: Client,
  subgraph: string,
  block: number,
  hash: string,
  indexer?: string
) {
  try {
    const result = indexer
      ? await client.query(poiQuery(subgraph, block, hash, indexer)).toPromise()
      : await client.query(poiQuery(subgraph, block, hash)).toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.proofOfIndexing;
  } catch {
    console.warn(
      `⚠️ No POI fetched from the local graph-node for subgraph ${subgraph}.`
        .yellow
    );
  }
}

export const costModels = async (client: Client): Promise<CostModel[]> => {
  try {
    const result = await client
      .query(
        gql`
          {
            costModels {
              deployment
              model
              variables
            }
          }
        `
      )
      .toPromise();

    if (result.error) {
      throw result.error;
    }
    return result.data.costModels;
  } catch (error) {
    console.warn(`Failed to query costModels`, { error });
    return [];
  }
};

export async function updateCostModel(client: Client, costModel: CostModel) {
  try {
    const result = await client
      .mutation(
        gql`
          mutation setCostModel($costModel: CostModelInput!) {
            setCostModel(costModel: $costModel) {
              deployment
              model
              variables
            }
          }
        `,
        { costModel }
      )
      .toPromise();

    if (result.error) {
      throw result.error;
    }
    return result.data.setCostModel;
  } catch {
    console.warn(
      `Failed to update cost model ${costModel} at indexer management server, skip for now`
        .yellow
    );
  }
}
