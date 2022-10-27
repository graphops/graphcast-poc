import * as protobuf from "protobufjs/light";

const Type = protobuf.Type;
const Field = protobuf.Field;

export interface GraphcastMessagePayload {
  radioPayload: string;
  nonce: number;
  blockNumber: number;
  blockHash: string;
  signature: string;
}

export class GraphcastMessage {
  private static Type = new Type("GraphcastMessage")
    .add(new Field("radioPayload", 1, "string"))
    .add(new Field("nonce", 2, "int64"))
    .add(new Field("blockNumber", 3, "int64"))
    .add(new Field("blockHash", 4, "string"))
    .add(new Field("signature", 5, "string"));

  public static domain = {
    name: `graphcast`,
    version: "0",
  };

  constructor(public payload: GraphcastMessagePayload) {}

  public encode(): Uint8Array {
    const message = GraphcastMessage.Type.create(this.payload);
    return GraphcastMessage.Type.encode(message).finish();
  }

  public static decode(
    bytes: Uint8Array | Buffer
  ): GraphcastMessage | undefined {
    const payload = GraphcastMessage.Type.decode(
      bytes
    ) as unknown as GraphcastMessagePayload;
    if (!payload.radioPayload) {
      throw new Error("Radio payload is missing on decoded GraphcastMessage");
    }
    return new GraphcastMessage(payload);
  }

  get radioPayload(): string {
    return this.payload.radioPayload;
  }
}
