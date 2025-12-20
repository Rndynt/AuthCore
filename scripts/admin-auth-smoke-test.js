#!/usr/bin/env node

import fs from "fs";
import path from "path";

const root = process.cwd();

const serverPath = path.join(root, "src", "server.ts");
const adminRoutesPath = path.join(root, "src", "admin", "routes.ts");

const serverSource = fs.readFileSync(serverPath, "utf8");
const adminRoutesSource = fs.readFileSync(adminRoutesPath, "utf8");

const failures = [];

const assert = (condition, message) => {
  if (!condition) {
    failures.push(message);
  }
};

assert(
  !serverSource.includes("adminAuthMiddleware"),
  "Found adminAuthMiddleware in src/server.ts. Admin routes must use adminSessionMiddleware."
);

assert(
  !adminRoutesSource.includes("adminAuthMiddleware"),
  "Found adminAuthMiddleware in src/admin/routes.ts. Admin routes must use adminSessionMiddleware."
);

assert(
  /app\.get\(\s*["']\/admin\/tenants["']\s*,\s*{\s*preHandler:\s*adminSessionMiddleware\s*}/.test(
    serverSource
  ),
  "Route /admin/tenants must use adminSessionMiddleware."
);

assert(
  /app\.get\(\s*["']\/admin\/stats["']\s*,\s*{\s*preHandler:\s*adminSessionMiddleware\s*}/.test(
    serverSource
  ),
  "Route /admin/stats must use adminSessionMiddleware."
);

assert(
  adminRoutesSource.includes("createAdminApiHandlers"),
  "Admin routes should use shared admin API handlers."
);

if (failures.length > 0) {
  console.error("Admin auth smoke test failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Admin auth smoke test passed.");
