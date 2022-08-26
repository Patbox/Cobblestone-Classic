import { WorldView } from '../../../world/world.ts';
import { blockIds } from '../../../world/blocks.ts';
import { sendStatusToMain } from '../../../world/generation/general.ts';
import { createClassicTree, createTree } from "../../../world/generation/tree.ts";

export function placeTopLayer(worker: Worker, tempWorld: WorldView, world: WorldView) {
	const size = world.size[0] * world.size[1] * world.size[2];
	let i = 0;
	sendStatusToMain(worker, 'Planting grass', (i / size) * 100);
	for (let x = 0; x < world.size[0]; x++) {
		for (let z = 0; z < world.size[2]; z++) {
			for (let y = 0; y < world.size[1]; y++) {
				const b4 = tempWorld.getBlockId(x, y + 4, z);
				const b3 = tempWorld.getBlockId(x, y + 3, z);
				const b2 = tempWorld.getBlockId(x, y + 2, z);
				const b1 = tempWorld.getBlockId(x, y + 1, z);
				const b0 = tempWorld.getBlockId(x, y, z);

				let block = 0;

				if (b0 == 1 && b1 == 0 && b2 == 0) {
					block = y > world.size[1] / 2 + 2 ? blockIds.grass : blockIds.sand;
				} else if (b0 + b1 + b2 + b3 + b4 == 5) {
					block = blockIds.stone;
				} else if (b0 == 1 && b1 == 1 && b4 == 0) {
					block = y <= (world.size[1] - 1) / 2 && y + 2 <= world.size[1] / 8 - 1 ? blockIds.sand : blockIds.dirt;
				} else {
					block = y > (world.size[1] - 1) / 2 ? blockIds.air : blockIds.water;
				}

				world.setBlockId(x, y, z, block);
				i++;
			}
			sendStatusToMain(worker, 'Planting grass', (i / size) * 100);
		}
	}
}

export function placePlants(worker: Worker, world: WorldView, seed: number, hash: (...i: number[]) => number) {
	const size = world.size[0] * world.size[1] * world.size[2];
	let i = 0;
	sendStatusToMain(worker, 'Planting plants', i / size * 100);
		for (let x = 0; x < world.size[0]; x++) {
			for (let z = 0; z < world.size[2]; z++) {
				for (let y = 0; y < world.size[1]; y++) {
					const b0 = world.getBlockId(x, y, z);
					const bm1 = world.getBlockId(x, y - 1, z);

					if (bm1 == blockIds.grass && b0 == blockIds.air) {
						if (hash(seed, x, y, z, 346346) < 0.1) {
							world.setBlockId(x, y, z, hash(seed, x, y, z, 463) >= 0.5 ? blockIds.rose : blockIds.dandelion);
						} else if (hash(seed, x, y, z, 34656, x / z) < 0.001) {
							createTree(world, hash, x, y, z, seed, blockIds.wood, blockIds.leaves);
						} else if (hash(seed, y, x, z, 4774, x / z) < 0.004) {
							createClassicTree(world, hash, x, y, z, seed, blockIds.wood, blockIds.leaves);
						}
					}
					i++;
				}
				sendStatusToMain(worker, 'Planting plants', i / size * 100);
			}
		}
}
