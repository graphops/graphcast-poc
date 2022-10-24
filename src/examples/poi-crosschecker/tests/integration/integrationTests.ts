import { createLogger } from "@graphprotocol/common-ts";
import { compareAttestations } from "./compareAttestations";
import { assertAttestationCount } from "./assertAttestationCount";

const integrationTests = async () => {
  const logger = createLogger({
    name: `poi-crosschecker-integration-tests`,
    async: false,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    level: process.env.logLevel as any,
  });

  const args = process.argv;
  const containers = args.slice(2);

  await compareAttestations(logger);
  await assertAttestationCount(logger, containers);
};

// eslint-disable-next-line @typescript-eslint/no-empty-function
integrationTests().then(() => {});
