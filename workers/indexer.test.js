const assert = require("node:assert/strict");
const test = require("node:test");
const indexToString = require("./indexer");

test("convertit les index en chaînes sans doublon", () => {
    const values = Array.from({ length: 6 }, (_, index) =>
        indexToString(index, "ab")
    );

    assert.deepEqual(values, ["a", "b", "aa", "ab", "ba", "bb"]);
});
