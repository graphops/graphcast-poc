📝 As prerequisite to running the POC, make sure that:
1. You have a running graph-node with at least 1 fully synced subgraph.
2. You've populated the environment variables in the `Dockerfile` - as of right now you only need to put in the IPFS hash of your subgraph as the `TEST_SUBGRAPH` and the Ethereum RPC node that you are using as `ETH_NODE`, the value of `INDEXER_ADDRESS` doesn't matter, `TEST_RUN` should be set to `true`.
3. Have `typescript` installed globally.
5. Have a docker daemon running (Docker Desktop if you're on MacOS).

🚀 To run the Gossip client along with the poi-crosschecker module run the following command:
`docker build -t poi-crosschecker . && docker run -e "TERM=xterm-256color" poi-crosschecker`
