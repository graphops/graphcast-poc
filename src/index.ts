import { startObserver } from "./observer";
import { sendMessage } from "./messenger";

const run = async () => {
  await startObserver();
  await sendMessage("Hello.");
};

run().then(() => {
  console.log("Running gossip client...");
}, err => {
  console.log(`Oh no! Something went wrong: ${err.message}`);
  process.exit(1);
});
