const { Pool } = require("pg");

const isProduction = !!process.env.DATABASE_URL;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/truetech",
  ssl: isProduction ? { rejectUnauthorized: false } : false
});

module.exports = pool;