const axios = require("axios");
const crypto = require("crypto");
const indexToString = require("./indexer");

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

const workerId = "W" + Math.floor(Math.random() * 10000);
const masterUrl = process.env.MASTER_URL || "http://localhost:3000";

function log(c, p, m) {
    console.log(`${c}${p}${C.reset} ${m}`);
}

async function processChunk(data) {
    log(C.cyan, `[${workerId}]`, `🧩 Traitement du chunk ${data.chunkId}`);

    const charset = data.charset;
    const target = data.hash;

    for (let i = data.start; i <= data.end; i++) {
        const text = indexToString(i, charset);

        const hash = crypto.createHash("md5").update(text).digest("hex");
        if (hash === target) {
            log(C.green, `[${workerId}]`, `🔥 MATCH trouvé : "${text}"`);

            await axios.post(`${masterUrl}/report`, {
                chunkId: data.chunkId,
                found: true,
                value: text,
            });

            return true;
        }
    }

    await axios.post(`${masterUrl}/report`, {
        chunkId: data.chunkId,
        found: false,
    });

    return false;
}

async function loop() {
    try {
        const res = await axios.get(
            `${masterUrl}/next-chunk?workerId=${encodeURIComponent(workerId)}`
        );

        const data = res.data;

        if (data.done) {
            await new Promise((r) => setTimeout(r, 2000));
            return loop();
        }

        await processChunk(data);
        return loop();
    } catch (e) {
        console.log("Erreur worker:", e.message);
        await new Promise((r) => setTimeout(r, 2000));
        loop();
    }
}

if (require.main === module) {
    log(C.green, `[${workerId}]`, "🚀 Worker lancé !");
    loop();
}
