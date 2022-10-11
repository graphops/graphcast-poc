import { gql } from "graphql-tag";
import { CostModel } from "./types";
import { Client } from "@urql/core";

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
    console.warn(`No allocation fetched, check connection and address`, {
      error: error.message,
    });
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
    console.warn(`Failed to query costModels`, { error: error.message });
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
  } catch (error) {
    console.warn(
      `Failed to update cost model for ${costModel.deployment} at indexer management server, skip for now`
        .yellow,
      {
        error: error.message,
      }
    );
  }
}

export const poiQuery = (subgraph: string, block: number, hash: string) => {
  console.log("INSIDE poiQuery");
  console.log(subgraph);

  console.log(
    `
      {
        proofOfIndexing(
          subgraph: ${subgraph},
          blockNumber:${block},
          blockHash:"${hash}"
        ) 
      }
      `
  );
  return gql`
      {
        proofOfIndexing(
          subgraph: ${subgraph.toString()},
          blockNumber:${block},
          blockHash:"${hash}"
        ) 
      }
      `;
};

export async function fetchPOI(
  client: Client,
  subgraph: string,
  block: number,
  hash: string
) {
  console.log("SUBGRAPH");
  console.log(subgraph);
  try {
    // Hotfix for weird ENUM issue
    subgraph = subgraph.includes("(") ? subgraph.substring(subgraph.indexOf("("), subgraph.indexOf(")")) : subgraph;
    console.log("DID IT WORK");
    console.log(subgraph);

    const result = await client
      .query(poiQuery(subgraph.toString(), block, hash))
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.proofOfIndexing;
  } catch (error) {
    console.log(error);
    console.warn(
      `⚠️ No POI fetched from the graph node for subgraph ${subgraph}.`.yellow,
      { error: error.message }
    );
  }
}
