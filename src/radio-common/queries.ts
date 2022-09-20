import { Client } from "@urql/core";
import { gql } from "graphql-tag";
import "colors";

export const indexerStakeQuery = gql`
  query indexer($address: String!) {
    indexer(id: $address) {
      stakedTokens
    }
  }
`;

export const operatorOfIndexerQuery = gql`
  query gossipOperatorOf($address: String!) {
    graphAccount(id: $address) {
      id
      gossipOperatorOf {
        id
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
    return result.data.graphAccount.gossipOperatorOf.map((account) => {
      return account.id;
    });
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
    console.warn(`Failed to fetch minimum indexer stake requirement`);
    return Number.POSITIVE_INFINITY;
  }
}
