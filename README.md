# Gossip Client POC
This repo contains a POC for the Gossip Network client,  as well as a single module example - a POI cross-checker.
## 🏃 Quick start
📝 **As prerequisites to running the poi-crosschecker POC, make sure that**:
1. You have a running **graph-node** instance with at least 1 fully synced subgraph.
2. You've populated the environment variables in the `Dockerfile` - as of right now you only need to put in the IPFS hash of your subgraph as the `TEST_SUBGRAPH` variable and the Ethereum RPC node that you are using as `ETH_NODE`, the value of `INDEXER_ADDRESS` doesn't matter for now, also `TEST_RUN` should be set to `true`.
3. Have `typescript` installed globally.
5. Have a Docker daemon running (Docker Desktop if you're on macOS).

🚀 **To run the Gossip client along with the poi-crosschecker module, run the following command**:
```
docker build -t poi-crosschecker . && docker run -e "TERM=xterm-256color" poi-crosschecker
```

## 🛠️ How it works
There are two main components to this POC, one is the *base layer*, which will eventually be the core of the actual Gossip Client SDK, the other one is an example of how to build on top of that base layer and create modules. In this example, the module is a simple POI cross-checker. 

### 1️⃣ Base layer (SDK)
The base layer is used to abstract all the necessary components of each module away from the user. That includes:
- Connecting to the Gossip Network, e.g., a cluster of [Waku](https://waku.org/) nodes. It also provides an interface to subscribe to receive messages on specific topics and to broadcast messages onto the network.
- Interactions with an Ethereum node.

### 2️⃣ POI cross-checker
The POI cross-checker example leverages the base layer and defines the specific logic around constructing and sending messages, as well as receiving and handling them.

#### 🔃 Workflow
When an Indexer runs the POI cross-checker, they immediately start listening for new blocks on the Ethereum mainnet. On a certain interval (in the current example it's set to 5 blocks) the module fetches all the allocations of that Indexer and saves a list of the IPFS hashes of the subgraphs that the Indexer is allocating to. Right after that we loop through the list and send a request for a normalised POI for each subgraph (using the metadata of the block that we're on) and save those POIs in-memory, below we will refer to these POIs as *local*  POIs since they are the ones that we've generated. 

At the same time, other Indexers running the client will start doing the same, which means that messages start propagating through the network. We handle each message and add the POI from it in another in-memory store, we can refer to these POIs as *remote* POIs since these are the ones that we've received from other network participants. The messages don't come only with the POI and subgraph hash, they also include a timestamp, block number & sender address. It's important to note that before saving an entry to the store, we send a request for the sender's on-chain stake, which will be used later for sorting the entries.

After another interval (3 blocks in the current example) we compare our *local* POIs with the *remote* ones. We sort the remote ones so that for each subgraph (on each block) we can take the POI that is backed by the most on-chain stake (❗ This does not mean the one that is sent by the Indexer with the highest stake, but rather the one that has the most **combined** stake of all the Indexers that attested to it). After we have that top POI, we compare it with our *local* POI for that subgraph at that block. Voilà! We now know whether our POI matches with the current consensus on the network.

[![](https://mermaid.ink/img/pako:eNptz8EKwjAMBuBXKTkpbC-wg7A5j17cbtZDaUJXtrajawXZ9u5WhyBoTsnPR0hmkA4JClBejB1ra25ZqvJ6HDTZcGN5flguJEnfCdmZpkkomhZW7c4O40D7f74anOxZ67VS5H9s9TYN2e99JWRgyBuhMR0zvySH0JEhDkVqUfieA7drcnFEEeiEOjgPRfCRMhAxuOZh5WfeTK1F-sts4foEUQJOKQ)](https://mermaid.live/edit#pako:eNptz8EKwjAMBuBXKTkpbC-wg7A5j17cbtZDaUJXtrajawXZ9u5WhyBoTsnPR0hmkA4JClBejB1ra25ZqvJ6HDTZcGN5flguJEnfCdmZpkkomhZW7c4O40D7f74anOxZ67VS5H9s9TYN2e99JWRgyBuhMR0zvySH0JEhDkVqUfieA7drcnFEEeiEOjgPRfCRMhAxuOZh5WfeTK1F-sts4foEUQJOKQ)
