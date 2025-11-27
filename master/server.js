const express = require("express");
const cors = require("cors");
const pool = require("./db");
const { startSession } = require("./chunkManager");

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

// logging helper
function log(color, prefix, msg) {
    console.log(`${color}${prefix}${C.reset} ${msg}`);
}

const app = express();
app.use(express.json());
app.use(cors());

log(C.green, "[MASTER]", "🚀 Serveur lancé, en attente de requêtes...");

// POST /start
app.post("/start", async (req, res) => {
    log(C.blue, "[MASTER]", "📥 Reçu requête /start");
    log(C.gray, " └─ Body:", JSON.stringify(req.body));

    const { hash, charset, maxLength } = req.body;
    const sessionId = await startSession(hash, charset, maxLength);

    log(C.green, "[MASTER]", `🟢 Session créée ID=${sessionId}`);
    res.json({ sessionId });
});

// GET /status
app.get("/status", async (req, res) => {
    const result = await pool.query(
        `SELECT * FROM sessions ORDER BY id DESC LIMIT 1`
    );

    if (result.rows.length === 0) {
        log(C.magenta, "[MASTER]", "📊 /status → aucune session active");
        return res.json({ status: "no-session" });
    }

    log(C.cyan, "[MASTER]", "📊 /status → session envoyée");
    res.json(result.rows[0]);
});

// GET /next-chunk
app.get("/next-chunk", async (req, res) => {
    const workerId = req.query.workerId;
    // log(C.yellow, "[MASTER]", `🔧 Worker ${workerId} demande un chunk...`);

    const pending = await pool.query(
        `SELECT * FROM chunks WHERE status='pending' ORDER BY id ASC LIMIT 1`
    );

    if (pending.rows.length === 0) {
        // log(
        //     C.magenta,
        //     "[MASTER]",
        //     `⛔ Aucun chunk disponible pour ${workerId}`
        // );
        return res.json({ done: true });
    }

    const chunk = pending.rows[0];

    log(
        C.blue,
        "[MASTER]",
        `📦 Attribution chunk ${chunk.id} → worker ${workerId}`
    );

    await pool.query(
        `UPDATE chunks
     SET status='in_progress',
         workerId=$1,
         updatedAt=NOW()
     WHERE id=$2`,
        [workerId, chunk.id]
    );

    const session = await pool.query(`SELECT * FROM sessions WHERE id=$1`, [
        chunk.sessionid,
    ]);

    log(C.gray, " └─", `Chunk ${chunk.id} passé à in_progress`);

    res.json({
        chunkId: chunk.id,
        start: chunk.start,
        end: chunk.end,
        hash: session.rows[0].hash,
        charset: session.rows[0].charset,
        maxLength: session.rows[0].maxlength,
    });
});

// POST /report
app.post("/report", async (req, res) => {
    const { chunkId, found, value } = req.body;

    log(C.cyan, "[MASTER]", `📨 /report reçu pour chunk ${chunkId}`);
    log(C.gray, " └─", found ? `FOUND → ${value}` : "NOT FOUND");

    if (found) {
        await pool.query(
            `UPDATE sessions
       SET status='done', result=$1
       WHERE id=(SELECT sessionId FROM chunks WHERE id=$2)`,
            [value, chunkId]
        );

        log(C.green, "[MASTER]", `🏁 Résultat trouvé : ${value}`);
        return res.json({ ok: true });
    }

    await pool.query(
        `UPDATE chunks
     SET status='done', updatedAt=NOW()
     WHERE id=$1`,
        [chunkId]
    );

    log(C.yellow, "[MASTER]", `✔ Chunk ${chunkId} terminé (no result)`);
    res.json({ ok: true });
});

app.listen(3000, () =>
    log(C.bold + C.green, "[MASTER]", "🟩 Serveur master actif sur port 3000 !")
);
