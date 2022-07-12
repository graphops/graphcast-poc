import { Waku } from "js-waku";

export const observer = async (waku: Waku) => {
  waku.relay.addObserver(
    (msg) => {
      console.log("Message received:", msg.payloadAsUtf8);
    },
    ["/my-cool-app/123/my-use-case/proto"],
  );
};
