import type { Server } from '../server.ts';
import { WorldGenerator, WorldView } from '../world/world.ts';
import { blockIds } from '../world/blocks.ts';
import { createWorkerGenerator } from '../world/generation/general.ts';

export const emptyGenerator: WorldGenerator = {
	name: 'empty',
	software: 'Cobblestone',
	minimalSize: [1, 1, 1],
	generate: (sizeX: number, sizeY: number, sizeZ: number, _seed?: number) => {
		const world = new WorldView(null, sizeX, sizeY, sizeZ);
		return new Promise((r) => {
			r(world);
		});
	},
};

export function setupGenerators(server: Server) {
	function workerGenerator(pos: string) {
		return createWorkerGenerator(new URL(pos, import.meta.url ?? ''));
	}

	server.addGenerator({
		name: 'grasslands',
		software: 'Cobblestone',
		minimalSize: [32, 64, 32],
		generate: workerGenerator('./generators/grasslands.ts'),
	});

	server.addGenerator({
		name: 'island',
		software: 'Cobblestone',
		minimalSize: [64, 64, 64],
		generate: workerGenerator('./generators/island.ts'),
	});

	server.addGenerator({
		name: 'flat',
		software: 'Cobblestone',
		minimalSize: [1, 8, 1],
		generate: (sizeX: number, sizeY: number, sizeZ: number, _seed?: number) => {
			const world = new WorldView(null, sizeX, sizeY, sizeZ);

			for (let y = 0; y < sizeY; y++) {
				const block = y > sizeY / 2 ? blockIds.air : y == sizeY / 2 ? blockIds.grass : y > sizeY / 2 - 4 ? blockIds.dirt : blockIds.stone;
				for (let x = 0; x < sizeX; x++) {
					for (let z = 0; z < sizeZ; z++) {
						world.setBlockId(x, y, z, block);
					}
				}
			}

			return new Promise((r) => {
				r(world);
			});
		},
	});

	server.addGenerator(emptyGenerator);
}
