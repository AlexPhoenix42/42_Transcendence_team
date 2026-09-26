/**
 * Return random number between 0 and total less one.
 * @param total - The total number of items.
 * @returns The random number.
 */
const rnd = (total: number): number => Math.floor(Math.random() * total);

export default rnd;
