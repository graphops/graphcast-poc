# Graphcast POC

## 📯 Introduction
This repo contains a POC for Graphcast,  as well as a single Radio example - a POI cross-checker. 

The key requirement for an Indexer to earn indexing rewards is to submit a valid Proof of Indexing promptly. The importance of valid POIs causes many Indexers to alert each other on subgraph health in community discussions. To alleviate the Indexer workload, this Radio can aggregate and exchange POI along with a list of Indexer on-chain identities that can be used to trace reputations. With the pubsub pattern, the Indexer can effectively automatically close an allocation when some trusted Indexer(s) publishes a different POI or alert subgraph syncing failure. 

To see the full idea behind Graphcast, you can check out the [GRC](https://forum.thegraph.com/t/grc-001-graphcast-a-gossip-network-for-indexers/3544/8) for it.

## 📝 Features
- Showcases the Graphcast SDK with the help of a real-world example - a POI cross-checker
- Serves as a full demo of the most critical pieces of the Graphcast SDK

## 🏃 Quickstart
**Currently the POI cross-checker is only working with Goerli addresses.**

📝 **As prerequisites to running the POI cross-checker POC, make sure that**:
1. You have registered a Graphcast operator address. You can connect a operator address to your indexer address (with a 1:1 relationship) using our very own Registry subgraph. 
1. You have a running **graph-node** instance with at least 1 fully synced subgraph.
2. You've populated the environment variables in your `.env` file. As per the `.env.example` file, you only need to specify `ETH_NODE` and `RADIO_OPERATOR_PRIVATE_KEY`.
3. Have `typescript` installed globally.
4. Have a Docker daemon running (Docker Desktop if you're on macOS).

🚀 **To run the Graphcast SDK, along with the POI cross-checker Radio, run the following command**:
```
docker-compose up poi-crosschecker
```

## 🎚️ Configuring
Currently the only way to change the base configuration of the Graphcast SDK is to change the environment variables in the `Dockerfile`.

## 🆕 Upgrading
Updates to this POC will be merged into the `main` branch once their respective PR has been approved. The POC will not be distributed as a npm package or as releases on Github, since at this stage it is not recommended to be used in production.

## 🧪 Testing 
There are unit tests both for the SDK and for the Radio, you can run them using `yarn test`.

We've also set up a simple integration test pipeline that uses a bash script to spin up a few mocked Radio instances as well as one real one. It then hooks up to the real instance and runs the test files from there. In order to use that you will need to populate the `.test-env.conf` file and run the following command:
```
yarn integration-tests
```

Tip: For better log formatting, you can install pino-pretty globally using `npm i -g pino-pretty` and running the tests with this instead:
```
yarn integration-tests | pino-pretty -c -f
```

## 🛠️ How it works
There are two main components to this POC, one is the *base layer*, which will eventually be the core of the actual Graphcast SDK, the other one is an example of how to build on top of that base layer and create Radios. In this example, the Radio is a simple POI cross-checker. 

### 1️⃣ Base layer (SDK)
The base layer is used to abstract all the necessary components of each Radio away from the user. That includes:
- Connecting to the Graphcast network, e.g., a cluster of [Waku](https://waku.org/) nodes. It also provides an interface to subscribe to receive messages on specific topics and to broadcast messages onto the network.
- Interactions with an Ethereum node.

### 2️⃣ POI cross-checker
The POI cross-checker example leverages the base layer and defines the specific logic around constructing and sending messages, as well as receiving and handling them.

#### 🔃 Workflow
When an Indexer runs the POI cross-checker, they immediately start listening for new blocks on the Ethereum mainnet. On a certain interval (in the current example it's set to 5 blocks) the Radio fetches all the allocations of that Indexer and saves a list of the IPFS hashes of the subgraphs that the Indexer is allocating to. Right after that we loop through the list and send a request for a normalised POI for each subgraph (using the metadata of the block that we're on) and save those POIs in a sqlite database inside the container, below we will refer to these POIs as *local*  POIs since they are the ones that we've generated. 

At the same time, other Indexers running the Radio will start doing the same, which means that messages start propagating through the network. We handle each message and add the POI from it in another in-memory store, we can refer to these POIs as *remote* POIs since these are the ones that we've received from other network participants. The messages don't come only with the POI and subgraph hash, they also include a nonce (UNIX timestamp), block number, sender (operator) address and sender stake. It's important to note that before saving an entry to the store, we send a request for the sender's on-chain stake, which will be used later for sorting the entries.

After another interval (3 blocks in the current example) we compare our *local* POIs with the *remote* ones. We sort the remote ones so that for each subgraph (on each block) we can take the POI that is backed by the most on-chain stake (❗ This does not mean the one that is sent by the Indexer with the highest stake, but rather the one that has the most **combined** stake of all the Indexers that attested to it). After we have that top POI, we compare it with our *local* POI for that subgraph at that block. Voilà! We now know whether our POI matches with the current consensus on the network.

[![](https://mermaid.ink/img/pako:eNptz8EKwjAMBuBXKTkpbC-wg7A5j17cbtZDaUJXtrajawXZ9u5WhyBoTsnPR0hmkA4JClBejB1ra25ZqvJ6HDTZcGN5flguJEnfCdmZpkkomhZW7c4O40D7f74anOxZ67VS5H9s9TYN2e99JWRgyBuhMR0zvySH0JEhDkVqUfieA7drcnFEEeiEOjgPRfCRMhAxuOZh5WfeTK1F-sts4foEUQJOKQ)](https://mermaid.live/edit#pako:eNptz8EKwjAMBuBXKTkpbC-wg7A5j17cbtZDaUJXtrajawXZ9u5WhyBoTsnPR0hmkA4JClBejB1ra25ZqvJ6HDTZcGN5flguJEnfCdmZpkkomhZW7c4O40D7f74anOxZ67VS5H9s9TYN2e99JWRgyBuhMR0zvySH0JEhDkVqUfieA7drcnFEEeiEOjgPRfCRMhAxuOZh5WfeTK1F-sts4foEUQJOKQ)

## Contributing

We welcome and appreciate your contributions! Please see the [Contributor Guide](/CONTRIBUTING.md), [Code Of Conduct](/CODE_OF_CONDUCT.md) and [Security Notes](/SECURITY.md) for this repository.
