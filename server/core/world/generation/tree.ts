import { blockIds } from '../blocks.ts';
import { WorldView } from '../world.ts';

export function createTree(world: WorldView, hash: (...args: number[]) => number, x: number, y: number, z: number, seed: number) {
	const size = Math.round(hash(seed * 5, 5483, x, y, z));
	const height = 5 + Math.round(hash(seed, x, y, z)) + size * 2;

	for (let y2 = 0; y2 < height; y2++) {
		if (world.isInBounds(x, y + y2, z) && world.getBlockId(x, y + y2, z) == 0) {
			world.setBlockId(x, y + y2, z, blockIds.wood);
		}
	}

	for (let x2 = -5; x2 <= 5; x2++) {
		for (let y2 = -4; y2 <= 5; y2++) {
			for (let z2 = -5; z2 <= 5; z2++) {
				if (
					world.isInBounds(x + x2, y + y2 + height - 1, z + z2) &&
					world.getBlockId(x + x2, y + y2 + height - 1, z + z2) == 0 &&
					hash(5435, x + x2, y + y2 + height - 1, z + z2, seed * 2) > 0.3 &&
					dist(x2, y2, z2) <= 4 + size
				) {
					world.setBlockId(x + x2, y + y2 + height - 1, z + z2, blockIds.leaves);
				}
			}
		}
	}
}

export function createClassicTree(world: WorldView, hash: (...args: number[]) => number, x: number, y: number, z: number, seed: number) {
	const size = Math.round(hash(seed * 5, 5483, x, y, z));
	const height = 4 + size * 2;

	for (let y2 = 0; y2 < height; y2++) {
		if (world.isInBounds(x, y + y2, z) && world.getBlockId(x, y + y2, z) == 0) {
			world.setBlockId(x, y + y2, z, blockIds.wood);
		}
	}

	const relY = y + height - 3;
	for (let x2 = -2; x2 <= 2; x2++) {
		const tX = x + x2;
		const absX = Math.abs(x2)
		for (let y2 = 0; y2 <= 1; y2++) {
			const tY = y2 + relY;
			for (let z2 = -2; z2 <= 2; z2++) {
				const tZ = z + z2;
				const absZ = Math.abs(z2);
				if (
					world.isInBounds(tX, tY, tZ) &&
					world.getBlockId(tX, tY, tZ) == 0 &&
					((absX != absZ || absX != 2) || hash(567, tX, tY, tZ, seed * 2) > 0.5)
				) {
					world.setBlockId(tX, tY, tZ, blockIds.leaves);
				}
			}
		}
	}

	for (let x2 = -1; x2 <= 1; x2++) {
		const tX = x + x2;
		const absX = Math.abs(x2)
		for (let y2 = 0; y2 <= 1; y2++) {
			const tY = y2 + relY + 2;
			for (let z2 = -1; z2 <= 1; z2++) {
				const tZ = z + z2;
				const absZ = Math.abs(z2);
				if (
					world.isInBounds(tX, tY, tZ) &&
					world.getBlockId(tX, tY, tZ) == 0 &&
					((absX != absZ || absX != 1) || (hash(567, tX, tY, tZ, seed * 2) > 0.6 && y2 != 1))
				) {
					world.setBlockId(tX, tY, tZ, blockIds.leaves);
				}
			}
		}
	}
}

function dist(x: number, y: number, z: number): number {
	return Math.sqrt(x * x + y * y + z * z);
}
