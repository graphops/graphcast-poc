# Graphcast POC

## 📯 Introduction
This repo contains a POC for Graphcast,  as well as a single Radio example - a POI cross-checker. 

The key requirement for an Indexer to earn indexing rewards is to submit a valid Proof of Indexing promptly. The importance of valid POIs causes many Indexers to alert each other on subgraph health in community discussions. To alleviate the Indexer workload, this Radio can aggregate and exchange POI along with a list of Indexer on-chain identities that can be used to trace reputations. With the pubsub pattern, the Indexer can effectively automatically close an allocation when some trusted Indexer(s) publishes a different POI or alert subgraph syncing failure. 

## 📝 Features
- Showcases the Graphcast SDK with the help of a real-world example - a POI cross-checker
- Serves as a full demo of the most critical pieces of the Graphcast SDK

## 🏃 Quickstart
📝 **As prerequisites to running the poi-crosschecker POC, make sure that**:
1. You have a running **graph-node** instance with at least 1 fully synced subgraph.
2. You've populated the environment variables in the `Dockerfile`.
3. Have `typescript` installed globally.
5. Have a Docker daemon running (Docker Desktop if you're on macOS).

🚀 **To run the Graphcast SDK, along with the poi-crosschecker Radio, run the following command**:
```
docker build -t poi-crosschecker . && docker run poi-crosschecker
```

## 🎚️ Configuring
Currently the only way to change the base configuration of the Graphcast SDK is to change the environment variables in the `Dockerfile` - `INDEXER_ADDRESS`, `GRAPH_NODE`, `ETH_NODE` and `NETWORK_SUBGRAPH`. That should be enough in terms of flexibility for now.

## 🆕 Upgrading
Updates to this POC will be merged into the `main` branch once their respective PR has been approved. The POC will not be distributed as a npm package or as releases on Github, since at this stage it is not recommended to be used in production.

## 🛠️ How it works
There are two main components to this POC, one is the *base layer*, which will eventually be the core of the actual Graphcast SDK, the other one is an example of how to build on top of that base layer and create Radios. In this example, the Radio is a simple POI cross-checker. 

### 1️⃣ Base layer (SDK)
The base layer is used to abstract all the necessary components of each Radio away from the user. That includes:
- Connecting to Graphcast, e.g., a cluster of [Waku](https://waku.org/) nodes. It also provides an interface to subscribe to receive messages on specific topics and to broadcast messages onto the network.
- Interactions with an Ethereum node.

### 2️⃣ POI cross-checker
The POI cross-checker example leverages the base layer and defines the specific logic around constructing and sending messages, as well as receiving and handling them.

#### 🔃 Workflow
When an Indexer runs the POI cross-checker, they immediately start listening for new blocks on the Ethereum mainnet. On a certain interval (in the current example it's set to 5 blocks) the Radio fetches all the allocations of that Indexer and saves a list of the IPFS hashes of the subgraphs that the Indexer is allocating to. Right after that we loop through the list and send a request for a normalised POI for each subgraph (using the metadata of the block that we're on) and save those POIs in-memory, below we will refer to these POIs as *local*  POIs since they are the ones that we've generated. 

At the same time, other Indexers running the Radio will start doing the same, which means that messages start propagating through the network. We handle each message and add the POI from it in another in-memory store, we can refer to these POIs as *remote* POIs since these are the ones that we've received from other network participants. The messages don't come only with the POI and subgraph hash, they also include a timestamp, block number & sender address. It's important to note that before saving an entry to the store, we send a request for the sender's on-chain stake, which will be used later for sorting the entries.

After another interval (3 blocks in the current example) we compare our *local* POIs with the *remote* ones. We sort the remote ones so that for each subgraph (on each block) we can take the POI that is backed by the most on-chain stake (❗ This does not mean the one that is sent by the Indexer with the highest stake, but rather the one that has the most **combined** stake of all the Indexers that attested to it). After we have that top POI, we compare it with our *local* POI for that subgraph at that block. Voilà! We now know whether our POI matches with the current consensus on the network.

[![](https://mermaid.ink/img/pako:eNptz8EKwjAMBuBXKTkpbC-wg7A5j17cbtZDaUJXtrajawXZ9u5WhyBoTsnPR0hmkA4JClBejB1ra25ZqvJ6HDTZcGN5flguJEnfCdmZpkkomhZW7c4O40D7f74anOxZ67VS5H9s9TYN2e99JWRgyBuhMR0zvySH0JEhDkVqUfieA7drcnFEEeiEOjgPRfCRMhAxuOZh5WfeTK1F-sts4foEUQJOKQ)](https://mermaid.live/edit#pako:eNptz8EKwjAMBuBXKTkpbC-wg7A5j17cbtZDaUJXtrajawXZ9u5WhyBoTsnPR0hmkA4JClBejB1ra25ZqvJ6HDTZcGN5flguJEnfCdmZpkkomhZW7c4O40D7f74anOxZ67VS5H9s9TYN2e99JWRgyBuhMR0zvySH0JEhDkVqUfieA7drcnFEEeiEOjgPRfCRMhAxuOZh5WfeTK1F-sts4foEUQJOKQ)

## Contributing

We welcome and appreciate your contributions! Please see the [Contributor Guide](/CONTRIBUTING.md), [Code Of Conduct](/CODE_OF_CONDUCT.md) and [Security Notes](/SECURITY.md) for this repository.
