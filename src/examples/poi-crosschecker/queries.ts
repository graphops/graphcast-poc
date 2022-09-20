import { gql } from "graphql-tag";
import { Client } from "@urql/core";
import { CostModel, Dispute } from "./types";

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

export const disputeIndexerQuery = gql`
  query disputes($address: String!) {
    disputes(where: { indexer: $address, status_in: [Accepted, Undecided] }) {
      id
      status
      tokensSlashed
    }
  }
`;

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
