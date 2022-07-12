import { observer } from "./observer";
import { messenger } from "./messenger";
import { Waku } from "js-waku";

const run = async () => {
  const waku = await Waku.create({
    bootstrap: {
      default: true,
    }
  });
  
  await waku.waitForRemotePeer();

  await observer(waku);
  await messenger("Custom message");
}

run().then(() => {
  console.log("Running gossip client...");
}, err => {
  console.log(`Oh no! Something went wrong: ${err.message}`);
  process.exit(1);
});
