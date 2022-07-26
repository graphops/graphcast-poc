import { gql } from "graphql-request";

export const indexerAllocationsQuery = gql`
{
  indexer(id:"${process.env.INDEXER_ADDRESS}", subgraphError:deny){
    allocations {
      subgraphDeployment {
        id,
        ipfsHash
      }
    }
  }
}
`

export const indexerStakeQuery = gql`
{
  indexer(id:"${process.env.INDEXER_ADDRESS}", subgraphError:deny){
    stakedTokens
  }
}
`

export const poiQuery = (subgraph: string, block: number, hash: string) => {
    return gql`
    {
      proofOfIndexing(
        subgraph:"${subgraph}",
        blockNumber:${block},
        blockHash: "${hash}",
        indexer: "0x0000000000000000000000000000000000000000"
      ) 
    }
    `
}
