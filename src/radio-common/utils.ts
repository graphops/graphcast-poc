import { Attestation } from "./types";
import "colors";

export const printNPOIs = (nPOIs: Map<string, Map<string, Attestation[]>>) => {
  if (nPOIs.size === 0) {
    console.log("😔 State is empty.".blue);
  }
  nPOIs.forEach((blocks, subgraph) => {
    console.debug(`\n📝 Printing nPOIs for subgraph ${subgraph}:`.blue);
    blocks.forEach((attestations, block) => {
      console.log(`🔍  Attestations for block ${block}:`.cyan);
      attestations.forEach((a) => {
        console.log(
          `nPOI: ${a.nPOI}\nSender: ${a.indexerAddress}\nStake:${a.stake}\n`
            .cyan
        );
      });
    });
  });
};

export const sortAttestations = (attestations: Attestation[]) =>
  attestations.sort((a, b) => {
    if (a.stake < b.stake) {
      return 1;
    } else if (a.stake > b.stake) {
      return -1;
    } else {
      return 0;
    }
  });
