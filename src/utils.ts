import { Attestation } from "./radio-common/types";
import "colors";

export const printNPOIs = (nPOIs: Map<string, Map<string, Attestation[]>>) => {
  if (nPOIs.size === 0) {
    console.log("😔 State is empty.".blue);
  }
  nPOIs.forEach((blocks, subgraph) => {
    console.trace(`\n📝 Printing nPOIs for subgraph ${subgraph}:`.blue);
    blocks.forEach((attestations, block) => {
      console.log(`🔍  Attestations for block ${block}:`.cyan);
      attestations.forEach((a) => {
        console.log(
          `nPOI: ${a.nPOI}\nSender: ${a.indexerAddress}\nStake:${a.stake}\n`.cyan
        );
      });
    });
  });
};
