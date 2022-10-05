FROM alpine:latest

RUN apk add --update nodejs npm
RUN apk add sqlite

WORKDIR /usr/app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build
RUN sqlite3 /usr/app/poi_crosschecker.db "VACUUM;"

WORKDIR /usr/app/dist/src/examples/poi-crosschecker

ENV REGISTRY_SUBGRAPH "https://api.thegraph.com/subgraphs/name/juanmardefago/gossip-network-subgraph"
ENV NETWORK_SUBGRAPH "https://gateway.testnet.thegraph.com/network"
ENV TERM "xterm-256color"
ENV GRAPH_NODE http://host.docker.internal:8030/graphql
ENV INDEXER_MANAGEMENT_SERVER_PORT http://host.docker.internal:18000
ENV TEST_TOPIC QmeccoXogKyEBBewvfwK7D391XzdnkBkLmEboXE9cE9X8N

CMD node poi-crosschecker.js
