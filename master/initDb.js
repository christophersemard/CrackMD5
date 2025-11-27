const pool = require("./db");

const C = {
    reset: "\x1b[0m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    gray: "\x1b[90m",
};

function log(color, prefix, msg) {
    console.log(`${color}${prefix}${C.reset} ${msg}`);
}

async function initDb() {
    log(C.yellow, "[DB]", "Vérification du schéma Postgres...");

    await pool.query(`
        CREATE TABLE IF NOT EXISTS sessions (
            id SERIAL PRIMARY KEY,
            hash TEXT NOT NULL,
            charset TEXT NOT NULL,
            maxlength INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'running',
            result TEXT,
            createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS chunks (
            id SERIAL PRIMARY KEY,
            sessionId INTEGER NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
            start INTEGER NOT NULL,
            "end" INTEGER NOT NULL,
            status TEXT NOT NULL DEFAULT 'pending',
            workerId TEXT,
            createdAt TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            updatedAt TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_chunks_session_status ON chunks(sessionId, status)`
    );
    await pool.query(
        `CREATE INDEX IF NOT EXISTS idx_sessions_status ON sessions(status)`
    );

    log(C.green, "[DB]", "✔ Schéma prêt pour les sessions et les chunks");
}

module.exports = initDb;
