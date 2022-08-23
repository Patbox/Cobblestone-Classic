import { blockIds } from '../blocks.ts';
import { WorldView } from '../world.ts';

const { floor } = Math;

export function createOres(world: WorldView, hash: (...args: number[]) => number, seed: number) {
	const [maxX, maxY, maxZ] = world.getSize();

	const count = (((maxX * maxZ) / 64) * maxY) / 32 + 5;

	for (let i = 0; i < count; i++) {
		const r1 = hash(35324, seed, i);
		const r2 = hash(4756, seed, i);
		const r3 = hash(564345, seed, i);

		const rX = floor(r1 * maxX);
		const rY = floor(r2 * maxY);
		const rZ = floor(r3 * maxZ);

		const oreSize = hash(4756, seed, i, rX, rZ) * 5;

		const tmpVal = hash(4645, seed, rX, rZ);
		
		const oreType = tmpVal > 0.6 ? blockIds.coalOre : tmpVal < 0.27 ? blockIds.goldOre : blockIds.ironOre;

		for (let x = -oreSize; x <= oreSize; x++) {
			const uX = x + rX;
			for (let y = -oreSize; y <= oreSize; y++) {
				const uY = y + rY;
				for (let z = -oreSize; z <= oreSize; z++) {
					const uZ = z + rZ;

					if (world.getBlockId(uX, uY, uZ) == blockIds.stone && hash(35324, seed, uX, uY, uZ) > dist(x, y, z) / oreSize) {
						world.setBlockId(uX, uY, uZ, oreType);
					}
				}
			}
		}
	}
}

function dist(x: number, y: number, z: number): number {
	return Math.sqrt(x * x + y * y + z * z);
}
