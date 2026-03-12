import assert from "node:assert/strict";

import { startServer } from "./dev-server.mjs";

async function run() {
  const { port, close } = await startServer({ port: 0 });

  try {
    const response = await fetch(`http://127.0.0.1:${port}/`);
    const html = await response.text();

    assert.equal(response.status, 200, "Expected HTTP 200 from root entry.");
    assert.match(html, /<div id="app"><\/div>/, "Expected app mount point.");
    assert.match(html, /src\/main\.js/, "Expected main entry script.");

    console.log(`Smoke check passed on port ${port}`);
  } finally {
    await close();
  }
}

run().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
