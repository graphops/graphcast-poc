FROM alpine:latest

RUN apk add --update nodejs npm

WORKDIR /usr/app
COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

WORKDIR /usr/app/dist/src/examples/ping-pong

ENV TERM "xterm-256color"
ENV LOG_LEVEL "trace"
ENV REGISTRY_SUBGRAPH "https://api.thegraph.com/subgraphs/name/hopeyen/gossip-registry-test"
ENV NETWORK_SUBGRAPH="https://gateway.testnet.thegraph.com/network"
ENV INDEXER_MANAGEMENT_SERVER="http://host.docker.internal:18000"
ENV GRAPH_NODE="http://host.docker.internal:8030/graphql"

CMD node index.js
