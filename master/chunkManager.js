const pool = require("./db");

// COLORS
const C = {
    reset: "\x1b[0m",
    blue: "\x1b[34m",
    cyan: "\x1b[36m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    red: "\x1b[31m",
    magenta: "\x1b[35m",
    gray: "\x1b[90m",
    bold: "\x1b[1m",
};

function log(c, p, m) {
    console.log(`${c}${p}${C.reset} ${m}`);
}

function computeTotalCombinations(charset, maxLength) {
    let total = 0;
    const base = charset.length;

    for (let len = 1; len <= maxLength; len++) {
        total += Math.pow(base, len);
    }
    return total;
}

exports.computeTotalCombinations = computeTotalCombinations;

async function generateChunks(sessionId, charset, maxLength) {
    const chunkSize = 50000;
    const total = computeTotalCombinations(charset, maxLength);

    const chunkCount = Math.ceil(total / chunkSize);

    log(
        C.blue,
        "[CHUNKS]",
        `📦 Génération des chunks pour session ${sessionId}`
    );
    log(C.gray, " ├─", `charset length = ${charset.length}`);
    log(C.gray, " ├─", `maxLength = ${maxLength}`);
    log(C.gray, " ├─", `TOTAL = ${total}`);
    log(C.gray, " ├─", `chunks = ${chunkCount}`);
    log(C.gray, " └─", `INSERT en cours...`);

    const startTime = Date.now();
    await pool.query(
        `INSERT INTO chunks (sessionId, start, "end", status)
         SELECT $1, block_start, LEAST(block_start + $2 - 1, $3 - 1), 'pending'
         FROM generate_series(0, $3 - 1, $2) AS block_start`,
        [sessionId, chunkSize, total]
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    log(
        C.green,
        "[CHUNKS]",
        `✔ Création des ${chunkCount} chunks terminée (${duration}s)`
    );
}

exports.startSession = async (hash, charset, maxLength) => {
    log(C.blue, "[SESSION]", "🆕 Création d'une nouvelle session...");

    const result = await pool.query(
        `INSERT INTO sessions (hash, charset, maxLength, status)
         VALUES ($1, $2, $3, 'running') RETURNING id`,
        [hash, charset, maxLength]
    );

    const sessionId = result.rows[0].id;

    log(C.green, "[SESSION]", `🟢 Session ${sessionId} créée`);
    log(C.gray, " └─", `Hash: ${hash}`);
    log(C.gray, " └─", `Charset: ${charset}`);
    log(C.gray, " └─", `MaxLength: ${maxLength}`);

    await generateChunks(sessionId, charset, maxLength);

    log(C.green, "[SESSION]", `🚀 Session ${sessionId} prête, chunks générés`);
    return sessionId;
};
