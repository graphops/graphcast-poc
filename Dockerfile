FROM node
WORKDIR /usr/app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

COPY ./src/examples/poi-crosschecker/proto/NPOIMessage.proto ./dist/src/examples/poi-crosschecker/proto/
WORKDIR ./dist/src/examples/poi-crosschecker

ENV GRAPH_NODE_HOST "host.docker.internal"
ENV ETH_NODE "host.docker.internal:8545"
ENV NETWORK_URL "https://gateway.testnet.thegraph.com/network"
ENV TERM "xterm-256color"
ENV GOERLI_NODE "<GOERLI_NODE>"
ENV REGISTRY_SUBGRAPH "https://api.thegraph.com/subgraphs/name/juanmardefago/gossip-network-subgraph"
ENV INDEXER_MANAGERMENT_SERVER "host.docker.internal:18000"
ENV RADIO_OPERATOR_PRIVATE_KEY "fef962f1ef75f1e5400e1a0cf7caf68e2bc3fb5413078c009ebb6336f0d37c56"

CMD node poi-crosschecker.js
