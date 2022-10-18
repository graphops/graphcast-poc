import { gql } from "graphql-tag";
import { CostModel } from "./types";
import { Client } from "@urql/core";
import { Logger } from "@graphprotocol/common-ts";

//TODO: condense for better and more efficient query and cache
export const indexerAllocationsQuery = gql`
  query indexer($address: String!) {
    indexer(id: $address) {
      allocations {
        subgraphDeployment {
          ipfsHash
        }
      }
    }
  }
`;

export async function fetchAllocatedDeployments(
  logger: Logger,
  client: Client,
  address: string
) {
  try {
    const result = await client
      .query(indexerAllocationsQuery, { address })
      .toPromise();
    if (result.error) {
      logger.warn(`Failed to fetch allocations`, { err: result.error });
      throw new Error(result.error.message);
    }
    return result.data.indexer.allocations.map(a => a.subgraphDeployment.ipfsHash);
  } catch (error) {
    logger.warn(`No allocation fetched, check connection and address`, {
      error: error.message,
    });
    return [];
  }
}

export const costModels = async (
  logger: Logger,
  client: Client
): Promise<CostModel[]> => {
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
      logger.error(`Failed to fetch cost models`, { err: result.error });
      throw new Error(result.error.message);
    }
    return result.data.costModels;
  } catch (error) {
    logger.warn(`Failed to query costModels`, { error: error.message });
    return [];
  }
};

export async function updateCostModel(
  logger: Logger,
  client: Client,
  costModel: CostModel
) {
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
      logger.warn(`Failed to update cost model`, { err: result.error });
      throw new Error(result.error.message);
    }
    return result.data.setCostModel;
  } catch (error) {
    logger.warn(
      `Failed to update cost model for ${costModel.deployment} at indexer management server, skip for now`,
      {
        error: error.message,
      }
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
  logger: Logger,
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
      logger.warn(`Failed to fetch POI`, { err: result.error });
      throw new Error(result.error.message);
    }
    return result.data.proofOfIndexing;
  } catch (error) {
    logger.warn(
      `⚠️ No POI fetched from the graph node for subgraph ${subgraph}.`,
      { error: error.message }
    );
  }
}
