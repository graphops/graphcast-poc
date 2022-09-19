const bail = (s) => {
    throw new Error(s)
  }
  
  module.exports = {
    collectCoverage: true,
    preset: 'ts-jest',
    testEnvironment: 'node',
    testPathIgnorePatterns: ['/node_modules/', '/dist/', '.husky'],
    globals: {
        host: process.env.NETWORK_URL || bail('NETWORK_URL is not defined'),
        REGISTRY_SUBGRAPH:
          process.env.REGISTRY_SUBGRAPH ||
          bail('REGISTRY_SUBGRAPH is not defined'),
        ETH_NODE: process.env.ETH_NODE || bail('ETH_NODE is not defined'),
        GRAPH_NODE_HOST: process.env.GRAPH_NODE_HOST || bail('GRAPH_NODE_HOST is not defined'),
        INDEXER_MANAGERMENT_SERVER: process.env.INDEXER_MANAGERMENT_SERVER || bail('INDEXER_MANAGERMENT_SERVER is not defined'),
        RADIO_OPERATOR_PRIVATE_KEY: process.env.RADIO_OPERATOR_PRIVATE_KEY || bail('RADIO_OPERATOR_PRIVATE_KEY is not defined'),
    },
  }
  