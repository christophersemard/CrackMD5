function indexToString(index, charset) {
    const base = charset.length;
    let value = "";

    while (index >= 0) {
        value = charset[index % base] + value;
        index = Math.floor(index / base) - 1;
    }

    return value;
}

module.exports = indexToString;
