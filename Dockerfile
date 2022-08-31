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
ENV INDEXER_MANAGEMENT_SERVER "host.docker.internal:18000"
ENV RADIO_OPERATOR "<RADIO_OPERATOR>"
ENV RADIO_OPERATOR_MNEMONIC "<RADIO_OPERATOR_MNEMONIC>"

CMD node poi-crosschecker.js
