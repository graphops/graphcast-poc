import { Client } from "@urql/core";
import { gql } from "graphql-tag";
import "colors";
import {
  formatGRT,
} from '@graphprotocol/common-ts'
import { Dispute } from "./types";

export const indexerAllocationsQuery = gql`
  query indexers($address: String!) {
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
  query indexers($address: String!) {
    indexer(id: $address) {
      stakedTokens
    }
  }
`;

export const disputeIndexerQuery = gql`
query disputes($address: String!) {
  disputes(where: {
    indexer: $address,
    status_in: [Accepted, Undecided]
  }){
    id
    status
    tokensSlashed
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
      throw result.error
    }
    return result.data.indexer.allocations
  } catch (error) {
      console.warn(`No allocation fetched, check connection and address`)
      return []
  }
}

export async function fetchDisputes(client: Client, address: string) : Promise<Dispute[]> {
  try {
    const result = await client
      .query(disputeIndexerQuery, { address })
      .toPromise();
    if (result.error) {
      throw result.error
    }
    return result.data.disputes
  } catch (error) {
      console.warn(`No disputes fetched, assume nothing...?`)
      return []
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
    return result.data.indexer.stakedTokens
  } catch (error) {
    console.warn(`No stake fetched for indexer ${address}, assuming 0`)
    return 0
  }
}

export async function fetchMinStake(client: Client) {
  try {
    const result = await client
      .query(gql`
      {
        graphNetwork(id:"1"){
          minimumIndexerStake
        }
      }`)
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.graphNetwork.minimumIndexerStake
  } catch (error) {
    throw new Error(`Failed to fetch minimum indexer stake requirement`)
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
      `⚠️ No POI fetched from the local graph-node for subgraph ${subgraph}.`.yellow
    );
  }
}
