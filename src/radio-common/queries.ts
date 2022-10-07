import { gql } from "graphql-tag";
import "colors";

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
