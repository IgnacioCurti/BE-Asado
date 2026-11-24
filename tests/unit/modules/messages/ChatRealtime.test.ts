import { describe, expect, it } from "vitest";
import { AblyChatRealtime, CHAT_TOKEN_TTL_MS, chatChannel } from "../../../../src/modules/messages/ChatRealtime.js";

// createTokenRequest se firma localmente con la key: no sale a la red.
describe("AblyChatRealtime.createTokenRequest", () => {
  const realtime = new AblyChatRealtime("testapp.testkey:test-secret");

  it("solo permite escuchar el canal del evento, como el usuario, por 15 minutos", async () => {
    const token = await realtime.createTokenRequest("evt1", "user1");

    expect(token).toMatchObject({ keyName: "testapp.testkey", clientId: "user1", ttl: CHAT_TOKEN_TTL_MS });
    expect(JSON.parse(token.capability)).toEqual({ "event:evt1": ["subscribe"] });
    expect(token.mac).toEqual(expect.any(String));
  });

  it("no expone el secreto de la key", async () => {
    const token = await realtime.createTokenRequest("evt1", "user1");
    expect(JSON.stringify(token)).not.toContain("test-secret");
  });

  it("el canal de un evento es event:<id>", () => {
    expect(chatChannel("abc")).toBe("event:abc");
  });
});
