#!/usr/bin/env node
const { Client } = require("pg");
const fs = require("fs");
const path = require("path");

const dbUrl = process.env.DATABASE_URL || process.argv[2];

if (!dbUrl) {
  console.error("Usage: node scripts/apply-migration.js <DATABASE_URL>");
  console.error("");
  console.error("Find your database URL in the Supabase Dashboard:");
  console.error("  Settings > Database > Connection string (URI)");
  console.error("");
  console.error("Or set DATABASE_URL in your .env file and run:");
  console.error("  node scripts/apply-migration.js");
  process.exit(1);
}

const sql = fs.readFileSync(
  path.join(__dirname, "../supabase/migrations/003_add_page_history.sql"),
  "utf8"
);

const statements = sql
  .split(";")
  .map((s) => s.trim())
  .filter((s) => s.length > 0 && !s.startsWith("--"));

(async () => {
  const client = new Client({
    connectionString: dbUrl,
    ssl: { rejectUnauthorized: false },
  });

  try {
    await client.connect();
    console.log("Connected to database.");

    for (const stmt of statements) {
      await client.query(stmt);
    }

    console.log("Migration applied successfully!");
    console.log("Table page_history is ready.");
  } catch (e) {
    console.error("Error:", e.message);
    process.exit(1);
  } finally {
    await client.end();
  }
})();
