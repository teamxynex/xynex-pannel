import axios from "axios";
import assert from "assert";
import crypto from "crypto";
import jwt from "jsonwebtoken";

const API_URL = "http://localhost:3000/api";
const JWT_SECRET = process.env.JWT_SECRET || "xynex-panel-super-secret";

async function runTests() {
  console.log("Starting API Key tests...");

  // Create temporary admin and user tokens
  const adminToken = jwt.sign({ id: "temp-admin", role: "admin", username: "admin" }, JWT_SECRET);
  const userToken = jwt.sign({ id: "temp-user", role: "user", username: "user" }, JWT_SECRET);

  const adminConfig = { headers: { Authorization: `Bearer ${adminToken}` } };
  const userConfig = { headers: { Authorization: `Bearer ${userToken}` } };

  try {
    // Test 1: Non-admin cannot list keys
    let errorCaught = false;
    try {
      await axios.get(`${API_URL}/admin/api-keys`, userConfig);
    } catch (e: any) {
      assert.strictEqual(e.response.status, 403);
      errorCaught = true;
    }
    assert.ok(errorCaught, "Non-admin should not be able to list keys");
    console.log("✓ Non-admin cannot list keys");

    // Test 2: Non-admin cannot create keys
    errorCaught = false;
    try {
      await axios.post(`${API_URL}/admin/api-keys`, { label: "Test Key" }, userConfig);
    } catch (e: any) {
      assert.strictEqual(e.response.status, 403);
      errorCaught = true;
    }
    assert.ok(errorCaught, "Non-admin should not be able to create keys");
    console.log("✓ Non-admin cannot create keys");

    // Test 3: Admin can create key
    const createRes = await axios.post(`${API_URL}/admin/api-keys`, { label: "Admin Test Key" }, adminConfig);
    assert.strictEqual(createRes.status, 200);
    assert.ok(createRes.data.key.startsWith("xynex_"));
    const apiKey = createRes.data.key;
    const keyId = createRes.data.id;
    console.log("✓ Admin can create key");

    // Test 4: Key works to access resources
    const keyConfig = { headers: { Authorization: `Bearer ${apiKey}` } };
    const meRes = await axios.get(`${API_URL}/auth/me`, keyConfig);
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.data.user.role, "admin");
    console.log("✓ Key can access resources");

    // Test 5: Rotate key
    const rotateRes = await axios.post(`${API_URL}/admin/api-keys/${keyId}/rotate`, {}, adminConfig);
    assert.strictEqual(rotateRes.status, 200);
    const newApiKey = rotateRes.data.key;
    assert.ok(newApiKey.startsWith("xynex_"));
    assert.notStrictEqual(apiKey, newApiKey);
    console.log("✓ Key can be rotated");

    // Test 6: Old key is rejected
    errorCaught = false;
    try {
      await axios.get(`${API_URL}/auth/me`, keyConfig);
    } catch (e: any) {
      assert.strictEqual(e.response.status, 401);
      errorCaught = true;
    }
    assert.ok(errorCaught, "Old key should be rejected");
    console.log("✓ Old key is rejected");

    // Test 7: New key works
    const newKeyConfig = { headers: { Authorization: `Bearer ${newApiKey}` } };
    const meRes2 = await axios.get(`${API_URL}/auth/me`, newKeyConfig);
    assert.strictEqual(meRes2.status, 200);
    console.log("✓ New key works");

    // Test 8: Revoke key
    const revokeRes = await axios.delete(`${API_URL}/admin/api-keys/${keyId}`, adminConfig);
    assert.strictEqual(revokeRes.status, 200);
    console.log("✓ Key can be revoked");

    // Test 9: Revoked key is rejected
    errorCaught = false;
    try {
      await axios.get(`${API_URL}/auth/me`, newKeyConfig);
    } catch (e: any) {
      assert.strictEqual(e.response.status, 401);
      errorCaught = true;
    }
    assert.ok(errorCaught, "Revoked key should be rejected");
    console.log("✓ Revoked key is rejected");

    console.log("All tests passed!");
  } catch (e: any) {
    console.error("Test failed:", e.message || e);
    if (e.response) {
      console.error("Response:", e.response.status, e.response.data);
    }
    process.exit(1);
  }
}

runTests();
