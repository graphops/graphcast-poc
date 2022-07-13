import { Observer } from "./observer";
import { Messenger } from "./messenger";

const run = async () => {
  const observer = new Observer();
  const messenger = new Messenger();

  await observer.init();
  await messenger.init();

  const topic = "/my-cool-app/123/my-use-case/proto";

  // TODO: Add wrapper to abstract around WakuMessage in callback
  observer.observe("/my-cool-app/123/my-use-case/proto", () => {
    console.log(`Messege received for topic ${topic}`);
  });

  await messenger.sendMessage("hello", topic);
};

run().then();