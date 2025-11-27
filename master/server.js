const express = require("express");
const cors = require("cors");
const pool = require("./db");
const initDb = require("./initDb");
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

async function getLatestSession() {
    const result = await pool.query(
        `SELECT * FROM sessions ORDER BY id DESC LIMIT 1`
    );

    return result.rows[0] || null;
}

async function sessionWithProgress() {
    const session = await getLatestSession();
    if (!session) return null;

    const countsResult = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE status='pending') AS pending,
            COUNT(*) FILTER (WHERE status='in_progress') AS in_progress,
            COUNT(*) FILTER (WHERE status='done') AS done
        FROM chunks
        WHERE sessionId=$1`,
        [session.id]
    );

    const counts = countsResult.rows[0];
    const pending = Number(counts.pending);
    const inProgress = Number(counts.in_progress);
    const done = Number(counts.done);
    const totalChunks = pending + inProgress + done;
    const progress = totalChunks === 0 ? 0 : Math.round((done / totalChunks) * 100);
    const normalizedProgress =
        session.status === "done" && progress < 100 ? 100 : progress;

    return {
        ...session,
        pending,
        inProgress,
        done,
        totalChunks,
        progress: normalizedProgress,
    };
}

// POST /start
app.post("/start", async (req, res) => {
    log(C.blue, "[MASTER]", "📥 Reçu requête /start");
    log(C.gray, " └─ Body:", JSON.stringify(req.body));

    const { hash, charset, maxLength } = req.body;
    const parsedMaxLength = Number(maxLength);

    if (!hash || !/^[a-fA-F0-9]{32}$/.test(hash)) {
        return res
            .status(400)
            .json({ error: "Hash MD5 invalide (32 caractères hexadécimaux)." });
    }

    if (!charset || typeof charset !== "string" || charset.length === 0) {
        return res
            .status(400)
            .json({ error: "Le charset ne peut pas être vide." });
    }

    if (!Number.isInteger(parsedMaxLength) || parsedMaxLength <= 0) {
        return res
            .status(400)
            .json({ error: "maxLength doit être un entier positif." });
    }

    const sessionId = await startSession(hash, charset, parsedMaxLength);

    log(C.green, "[MASTER]", `🟢 Session créée ID=${sessionId}`);
    res.json({ sessionId });
});

// GET /status
app.get("/status", async (req, res) => {
    const session = await sessionWithProgress();

    if (!session) {
        log(C.magenta, "[MASTER]", "📊 /status → aucune session active");
        return res.json({ status: "no-session" });
    }

    log(C.cyan, "[MASTER]", "📊 /status → session envoyée");
    res.json(session);
});

// GET /next-chunk
app.get("/next-chunk", async (req, res) => {
    const workerId = req.query.workerId;
    // log(C.yellow, "[MASTER]", `🔧 Worker ${workerId} demande un chunk...`);

    const session = await sessionWithProgress();

    if (!session || session.status === "done") {
        return res.json({ done: true, reason: "no-active-session" });
    }

    const pending = await pool.query(
        `SELECT * FROM chunks WHERE sessionId=$1 AND status='pending' ORDER BY id ASC LIMIT 1`,
        [session.id]
    );

    if (pending.rows.length === 0) {
        return res.json({ done: true, reason: "no-pending-chunk" });
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

    log(C.gray, " └─", `Chunk ${chunk.id} passé à in_progress`);

    res.json({
        chunkId: chunk.id,
        start: chunk.start,
        end: chunk.end,
        hash: session.hash,
        charset: session.charset,
        maxLength: session.maxlength,
    });
});

// POST /report
app.post("/report", async (req, res) => {
    const { chunkId, found, value } = req.body;

    log(C.cyan, "[MASTER]", `📨 /report reçu pour chunk ${chunkId}`);
    log(C.gray, " └─", found ? `FOUND → ${value}` : "NOT FOUND");

    const sessionIdResult = await pool.query(
        `SELECT sessionId FROM chunks WHERE id=$1`,
        [chunkId]
    );

    if (sessionIdResult.rows.length === 0) {
        log(C.red, "[MASTER]", `❌ Chunk ${chunkId} introuvable`);
        return res.status(404).json({ error: "chunk_not_found" });
    }

    const sessionId = sessionIdResult.rows[0].sessionid;

    if (found) {
        await pool.query(
            `UPDATE sessions
       SET status='done', result=$1, updatedAt=NOW()
       WHERE id=$2`,
            [value, sessionId]
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

    const remaining = await pool.query(
        `SELECT
            COUNT(*) FILTER (WHERE status='pending') AS pending,
            COUNT(*) FILTER (WHERE status='in_progress') AS in_progress
        FROM chunks WHERE sessionId=$1`,
        [sessionId]
    );

    const pending = Number(remaining.rows[0].pending);
    const inProgress = Number(remaining.rows[0].in_progress);

    if (pending + inProgress === 0) {
        await pool.query(
            `UPDATE sessions SET status='done', updatedAt=NOW() WHERE id=$1 AND status <> 'done'`,
            [sessionId]
        );
        log(C.magenta, "[MASTER]", `🏁 Session ${sessionId} terminée (aucun résultat trouvé)`);
    }

    log(C.yellow, "[MASTER]", `✔ Chunk ${chunkId} terminé (no result)`);
    res.json({ ok: true });
});

async function bootstrap() {
    await initDb();

    app.listen(3000, () =>
        log(
            C.bold + C.green,
            "[MASTER]",
            "🟩 Serveur master actif sur port 3000 !"
        )
    );
}

bootstrap().catch((err) => {
    log(C.red, "[MASTER]", `❌ Impossible de démarrer : ${err.message}`);
    process.exit(1);
});
