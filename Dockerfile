FROM node
WORKDIR /usr/app

COPY package.json ./
RUN npm install

COPY . .
RUN npm run build

COPY ./src/examples/poi-crosschecker/proto/NPOIMessage.proto ./dist/src/examples/poi-crosschecker/proto/
WORKDIR ./dist/src/examples/poi-crosschecker

ENV INDEXER_ADDRESS "0x365507a4eef5341cf00340f702f7f6e74217d96e"
ENV TEST_RUN true
ENV TEST_SUBGRAPH "QmbaLc7fEfLGUioKWehRhq838rRzeR8cBoapNJWNSAZE8u"
ENV LOCALHOST "host.docker.internal"
ENV ETH_NODE "host.docker.internal:8545"

CMD node poi-crosschecker.js
