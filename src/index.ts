// TODO: Move to examples folder
import { Observer } from "./observer";
import { Messenger } from "./messenger";

const run = async () => {
  const observer = new Observer();
  const messenger = new Messenger();

  await observer.init();
  await messenger.init();

  const topic = "/my-cool-app/123/my-use-case/proto";

  const handler = () => {
    console.log("Hello from custom callback from outside.");
  };

  observer.observe("/my-cool-app/123/my-use-case/proto", handler);
  await messenger.sendMessage("hello", topic);
};

run().then();
