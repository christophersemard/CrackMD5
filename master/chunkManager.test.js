const assert = require("node:assert/strict");
const test = require("node:test");
const { computeTotalCombinations } = require("./chunkManager");

test("calcule toutes les combinaisons jusqu'à la longueur maximale", () => {
    assert.equal(computeTotalCombinations("ab", 1), 2);
    assert.equal(computeTotalCombinations("ab", 3), 14);
    assert.equal(computeTotalCombinations("abc", 2), 12);
});
