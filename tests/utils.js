/**
 * Generate random hex. For testing only, taken from https://stackoverflow.com/a/58326357
 * @param size
 * @returns {string}
 */
export function genRanHex(size) {
    return [...Array(size)].map(() => Math.floor(Math.random() * 16).toString(16)).join('')
}