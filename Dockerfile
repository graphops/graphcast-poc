FROM node
WORKDIR /usr/app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

WORKDIR /usr/app/dist/src/examples/poi-crosschecker

ENV REGISTRY_SUBGRAPH "https://api.thegraph.com/subgraphs/name/juanmardefago/gossip-network-subgraph"
ENV NETWORK_URL "https://gateway.testnet.thegraph.com/network"
ENV TERM "xterm-256color"
ENV GRAPH_NODE host.docker.internal:8030
ENV ETH_NODE host.docker.internal:8545
ENV INDEXER_MANAGEMENT_SERVER_PORT host.docker.internal:18000
ENV RADIO_OPERATOR_PRIVATE_KEY "<RADIO_OPERATOR_PRIVATE_KEY>"

CMD node poi-crosschecker.js
