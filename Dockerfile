FROM node
WORKDIR /usr/app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

WORKDIR ./dist/src/examples/poi-crosschecker

ENV GRAPH_NODE_HOST "host.docker.internal"
ENV ETH_NODE "host.docker.internal:8545"
ENV NETWORK_URL "https://gateway.testnet.thegraph.com/network"
ENV TERM "xterm-256color"
ENV REGISTRY_SUBGRAPH "https://api.thegraph.com/subgraphs/name/juanmardefago/gossip-network-subgraph"
ENV INDEXER_MANAGERMENT_SERVER "host.docker.internal:18000"
ENV RADIO_OPERATOR_PRIVATE_KEY "<RADIO_OPERATOR_PRIVATE_KEY>"

CMD node poi-crosschecker.js
