import type { Server } from '../server.ts';
import { WorldView } from './world.ts';
import { blockIds } from './blocks.ts';
import { Position } from '../types.ts';

export function setupGenerators(server: Server) {
	server.addGenerator({
		name: 'flat',
		software: 'Cobblestone',
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

	server.addGenerator({
		name: 'grasslands',
		software: 'Cobblestone',
		generate: (sizeX: number, sizeY: number, sizeZ: number, seed?: number) => {
			return new Promise((res) => {
				const worker = new Worker(new URL('./generators/grasslands.ts', import.meta.url ?? '').href, { type: 'module' });
				worker.onmessage = (message) => {
					const data = <{ blockData: string; spawnPoint: Position }>message.data;
					res(new WorldView(new TextEncoder().encode(data.blockData), sizeX, sizeY, sizeZ, data.spawnPoint));
				};

				worker.onerror = (e) => {
					throw e.error;
				}

				worker.postMessage({ sizeX, sizeY, sizeZ, seed });
			});
		},
	});
}
