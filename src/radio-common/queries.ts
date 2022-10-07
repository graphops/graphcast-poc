import { Client } from "@urql/core";
import { gql } from "graphql-tag";
import "colors";
import { Dispute } from "../types";
import { formatUnits } from "ethers/lib/utils";
import { Logger } from "@graphprotocol/common-ts";

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

export async function fetchDisputes(
  logger: Logger,
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
    logger.warn(
      `Failed to grab disputes, assume nothing (maybe assume something?)`,
      { error: error.message }
    );
    return [];
  }
}

export async function fetchOperators(
  logger: Logger,
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
    logger.warn(`No operators fetched, assume none`, { error: error.message });
    return [];
  }
}

export async function fetchOperatorOfIndexers(
  logger: Logger,
  client: Client,
  address: string
) {
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
    logger.warn(
      `Did not find corresponding indexer address for the gossip operator`,
      { error: error }
    );
    return null;
  }
}

export async function fetchStake(
  logger: Logger,
  client: Client,
  address: string
) {
  try {
    const result = await client
      .query(indexerStakeQuery, { address })
      .toPromise();
    if (result.error) {
      throw result.error;
    }
    return Number(formatUnits(result.data.indexer.stakedTokens, 18));
  } catch (error) {
    logger.warn(`No stake fetched for indexer ${address}, assuming 0`, {
      error: error.message,
    });
    return 0;
  }
}

export async function fetchMinStake(logger: Logger, client: Client) {
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
    return Number(
      formatUnits(result.data.graphNetwork.minimumIndexerStake, 18)
    );
  } catch (error) {
    logger.warn(`Failed to fetch minimum indexer stake requirement`, {
      error: error.message,
    });
    return Number.POSITIVE_INFINITY;
  }
}
