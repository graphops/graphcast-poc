import { Client } from "@urql/core";
import { gql } from "graphql-tag";

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
  query indexers($addresses: [String!]!) {
    indexers(where: { id_in: $addresses }) {
      id
      stakedTokens
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
    //TODO: remove constant hardcoded address to variable
    const result = await client
      .query(indexerAllocationsQuery, { address: address })
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.indexer.allocations;
  } catch {
    console.warn(`No allocation fetched`);
    return [];
  }
}

export async function fetchStakes(client: Client, addresses: string[]) {
  try {
    //TODO: remove constant hardcoded address to variable
    const result = await client
      .query(indexerStakeQuery, { addresses: addresses })
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.indexers;
  } catch {
    console.warn(`No stake fetched`);
    return [];
  }
}

export async function fetchStake(client: Client, address: string) {
  try {
    //TODO: remove constant hardcoded address to variable
    const result = await client
      .query(indexerStakeQuery, { addresses: [address] })
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return result.data.indexers[0].stakedTokens;
  } catch {
    console.warn(`No stake fetched for indexer ${address}`);
    return 0;
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
      `No POI fetched from the local graph-node for subgraph ${subgraph}.`
    );
  }
}
