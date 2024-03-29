const bail = (s) => {
    throw new Error(s)
  }
  
  module.exports = {
    collectCoverage: true,
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '.husky'],
    globals: {
      TEST_TOPIC: process.env.TEST_TOPIC || [],
      LOG_LEVEL: process.env.LOG_LEVEL || 'info',
      NETWORK_SUBGRAPH: process.env.NETWORK_SUBGRAPH || bail('NETWORK_SUBGRAPH is not defined'),
      REGISTRY_SUBGRAPH:
        process.env.REGISTRY_SUBGRAPH ||
        bail('REGISTRY_SUBGRAPH is not defined'),
      ETH_NODE: process.env.ETH_NODE || bail('ETH_NODE is not defined'),
      GRAPH_NODE: process.env.GRAPH_NODE || bail('GRAPH_NODE is not defined'),
      INDEXER_MANAGEMENT_SERVER: process.env.INDEXER_MANAGEMENT_SERVER || bail('INDEXER_MANAGEMENT_SERVER is not defined'),
      RADIO_OPERATOR_PRIVATE_KEY: process.env.RADIO_OPERATOR_PRIVATE_KEY || bail('RADIO_OPERATOR_PRIVATE_KEY is not defined'),
      },
  }
  
