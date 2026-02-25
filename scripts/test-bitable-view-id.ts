import assert from "node:assert/strict";
import { listRecords } from "../src/bitable-tools/actions.ts";

type ListCall = {
  path: { app_token: string; table_id: string };
  params: { page_size: number; page_token?: string; view_id?: string };
};

function createMockClient(impl: (call: ListCall) => Promise<any>) {
  return {
    bitable: {
      appTableRecord: {
        list: impl,
      },
    },
  } as any;
}

async function testWithoutViewId() {
  let captured: ListCall | null = null;
  const client = createMockClient(async (call) => {
    captured = call;
    return { code: 0, data: { items: [{ record_id: "rec1" }], has_more: false } };
  });

  const res = await listRecords(client, "app_tok", "tbl_tok");
  assert.equal(res.records.length, 1);
  assert.equal(captured?.params.page_size, 100);
  assert.equal("view_id" in (captured?.params ?? {}), false);
}

async function testWithViewIdPassthrough() {
  let captured: ListCall | null = null;
  const client = createMockClient(async (call) => {
    captured = call;
    return { code: 0, data: { items: [], has_more: false } };
  });

  await listRecords(client, "app_tok", "tbl_tok", 50, "page_1", "vew123abc");
  assert.equal(captured?.params.page_size, 50);
  assert.equal(captured?.params.page_token, "page_1");
  assert.equal(captured?.params.view_id, "vew123abc");
}

async function testInvalidViewIdErrorMessage() {
  const client = createMockClient(async () => {
    return {
      code: 1254043,
      msg: "Invalid view_id",
      log_id: "20260225_invalid_view",
    };
  });

  await assert.rejects(
    () => listRecords(client, "app_tok", "tbl_tok", 100, undefined, "bad_view_id"),
    (err: unknown) => {
      assert.ok(err instanceof Error);
      assert.match(err.message, /bitable\.appTableRecord\.list failed: Invalid view_id/);
      assert.match(err.message, /code=1254043/);
      assert.match(err.message, /log_id=20260225_invalid_view/);
      return true;
    },
  );
}

async function main() {
  await testWithoutViewId();
  await testWithViewIdPassthrough();
  await testInvalidViewIdErrorMessage();
  console.log("✅ bitable view_id tests passed");
}

main().catch((err) => {
  console.error("❌ bitable view_id tests failed", err);
  process.exit(1);
});
