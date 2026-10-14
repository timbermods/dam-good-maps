// The limits on relay logins (the function's bill): per session token, per address and per day (collab-worker's Keeper).
// A stack with small limits: 6 logins a day in all, 3 per address, 2 renewals per session token.
import { expect, test } from "@playwright/test";
import { startStack, workerInstalled } from "./localStack";
import type { Stack } from "./localStack";
import { makeApi, sessionTokens } from "./wire";
import type { Api } from "./wire";

test.skip(!workerInstalled(), "collab-worker's dependencies are not installed (npm ci --prefix collab-worker)");
test.describe.configure({ mode: "serial" });

let stack: Stack;
test.beforeAll(async () => {
  stack = await startStack({ vars: { MAX_DAILY_MINTS: "6", MAX_DAILY_MINTS_PER_ADDRESS: "3", MAX_TOKEN_RENEWALS: "2" } });
});
test.afterAll(async () => {
  await stack?.stop();
});

const message = async (r: Response) => ((await r.json()) as { error: { message: string } }).error.message;

/** A room with the guest joined: its host's key, ready to ask for relay logins. */
async function joinedRoom(a: Api) {
  const room = (await (await a.create()).json()) as { code: string; hostSecret: string };
  await a.join(room.code);
  return room;
}

test("a session token has its own budget of renewals, however many addresses it is used from", async () => {
  const tokens = await sessionTokens(makeApi(stack, "198.51.100.1"));
  // two renewals, each from another address (so the per-address limit is not what stops the third)
  expect((await makeApi(stack, "198.51.100.2").sessionIce(tokens[0])).status).toBe(200);
  expect((await makeApi(stack, "198.51.100.3").sessionIce(tokens[0])).status).toBe(200);
  const third = await makeApi(stack, "198.51.100.4").sessionIce(tokens[0]);
  expect(third.status).toBe(429);
  expect(await message(third)).toContain("renewed its relay login as often as it may");
  // the other player's token is a separate budget
  expect((await makeApi(stack, "198.51.100.5").sessionIce(tokens[1])).status).toBe(200);
});

test("one address cannot take more than its share of the day's logins, and its /64 counts as one address", async () => {
  // 3 of the day's 6 are used so far (3 renewals above)... the next three are this address's own
  const a = makeApi(stack, "2001:db8:1:2:aaaa::1");
  const sameNet = makeApi(stack, "2001:db8:1:2:bbbb::9"); // same /64
  const r1 = await joinedRoom(a);
  expect((await a.ice(r1.code, r1.hostSecret)).status).toBe(200);
  const r2 = await joinedRoom(sameNet);
  expect((await sameNet.ice(r2.code, r2.hostSecret)).status).toBe(200);
  expect((await a.ice(r1.code, r1.hostSecret)).status).toBe(200);
  const fourth = await sameNet.ice(r2.code, r2.hostSecret);
  expect(fourth.status).toBe(429);
  expect(await message(fourth)).toContain("Too many connections from here today");
});

test("the day's total stops everyone, with a plain message, once it is reached", async () => {
  // 3 + 3 = 6 used: that was the day's cap, so another address gets nothing
  const other = makeApi(stack, "198.51.100.77");
  const room = await joinedRoom(other);
  const refused = await other.ice(room.code, room.hostSecret);
  expect(refused.status).toBe(429);
  expect(await message(refused)).toContain("busy today");
});
