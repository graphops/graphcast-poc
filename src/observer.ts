import { Waku } from "js-waku";

export const startObserver = async () => {
  const waku = await Waku.create({
    bootstrap: {
      default: true,
    }
  });
  
  await waku.waitForRemotePeer();

  waku.relay.addObserver(
    (msg) => {
      console.log("Message received:", msg.payloadAsUtf8);
    },
    ["/my-cool-app/123/my-use-case/proto"]
  );
};