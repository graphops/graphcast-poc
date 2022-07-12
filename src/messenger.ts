import { Waku, WakuMessage } from "js-waku";

export const sendMessage = async (message: string) => {
  const waku = await Waku.create({
    bootstrap: {
      default: true,
    }
  });
  await waku.waitForRemotePeer();

  const msg = await WakuMessage.fromUtf8String(
    message,
    "/my-cool-app/123/my-use-case/proto",
  );

  await waku.relay.send(msg);
};
