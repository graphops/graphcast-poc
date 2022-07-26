import { Attestation } from "./types";

export const attestationExists = (attestations: Attestation[], sender: string, nPOI: string): boolean => {
  return attestations.some(a => {
    return a.indexerAddress === sender && a.nPOI === nPOI;
  })
}
