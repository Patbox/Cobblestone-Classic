import { blockIds } from '../blocks.ts';
import { opensimplex } from '../../deps.ts';
import { makeMurmur } from '../../../libs/murmur.ts';
import { WorldView } from '../world.ts';
import { createClassicTree, createTree } from './helpers/tree.ts';
import { createOres } from './helpers/ores.ts';
import { sendDataToMain } from "./helpers/general.ts";

if ('onmessage' in self) {
	const worker = self as Worker & typeof self;

	worker.onmessage = async (e: MessageEvent) => {
		const seed2 = e.data.seed;
		const xSize = e.data.sizeX;
		const ySize = e.data.sizeY;
		const zSize = e.data.sizeZ;

		let seed = Math.floor(Math.random() * 10000);
		if (seed2 != 0 && seed2 != undefined) {
			seed = seed2;
		}

		const hash = makeMurmur(seed);

		const heightNoise = opensimplex.makeNoise2D(Math.round(seed * 60 * Math.sin(seed ^ 3) * 10000));
		const heightNoise2 = opensimplex.makeNoise2D(Math.round(seed * 60 * 10000));
		const caveNoise = opensimplex.makeNoise3D(Math.round(seed * Math.sin(seed ^ 2) * 10000));
		const caveNoise2 = opensimplex.makeNoise3D(Math.round(seed * 10000));

		const tempWorld = new WorldView(null, xSize, ySize, zSize);

		const islandShape: number[][] = new Array(xSize);
		{
			const tmp = Math.sqrt(xSize * xSize + zSize * zSize);
			for (let x = 0; x < xSize; x++) {
				islandShape[x] = new Array(zSize);
				for (let z = 0; z < xSize; z++) {
					const tX = x - xSize / 2;
					const tZ = z - zSize / 2;

					const tmp2 = ySize / 2 - (tX * tX + tZ * tZ) / tmp + 12;

					islandShape[x][z] = tmp2 > ySize / 3 ? tmp2 : ySize / 3;
				}
			}
		}
		for (let y = 0; y < ySize; y++) {
			for (let x = 0; x < xSize; x++) {
				for (let z = 0; z < zSize; z++) {
					const h = heightNoise(x / 120, z / 120) + 0.4 + (heightNoise2(x / 10, z / 10) + 1) / 4;
					//if ((caveNoise(x / 70, y / 70, z / 70) * (1.2 - h) + caveNoise2(x / 40, y / 40, z / 40) * h) * 16  >= 0) {
					if ((caveNoise(x / 70, y / 70, z / 70) * (1.2 - h) + caveNoise2(x / 40, y / 40, z / 40) * h) * 16 + islandShape[x][z] + 3 >= y) {
						tempWorld.setBlockId(x, y, z, 1);
					}
				}
			}
		}

		const world = new WorldView(null, xSize, ySize, zSize);

		for (let y = 0; y < ySize; y++) {
			for (let x = 0; x < xSize; x++) {
				for (let z = 0; z < zSize; z++) {
					const b4 = tempWorld.getBlockId(x, y + 4, z);
					const b3 = tempWorld.getBlockId(x, y + 3, z);
					const b2 = tempWorld.getBlockId(x, y + 2, z);
					const b1 = tempWorld.getBlockId(x, y + 1, z);
					const b0 = tempWorld.getBlockId(x, y, z);

					let block = 0;

					if (b0 == 1 && b1 == 0 && b2 == 0) {
						block = y > (ySize) / 2 + 2 ? blockIds.grass : blockIds.sand;
					} else if (b0 + b1 + b2 + b3 + b4 == 5) {
						block = blockIds.stone;
					} else if (b0 == 1 && b1 == 1 && b4 == 0) {
						block = y <= (ySize - 1) / 2 && y + 2 <= zSize / 8 - 1 ? blockIds.sand : blockIds.dirt;
					} else {
						block = y > (ySize - 1) / 2 ? blockIds.air : blockIds.water;
					}

					world.setBlockId(x, y, z, block);
				}
			}
		}

		for (let y = 0; y < ySize; y++) {
			for (let x = 0; x < xSize; x++) {
				for (let z = 0; z < zSize; z++) {
					const b0 = world.getBlockId(x, y, z);
					const bm1 = world.getBlockId(x, y - 1, z);

					if (bm1 == blockIds.grass && b0 == blockIds.air) {
						if (hash(seed, x, y, z, 346346) < 0.1) {
							world.setBlockId(x, y, z, hash(seed, x, y, z, 463) >= 0.5 ? blockIds.rose : blockIds.dandelion);
						} else if (hash(seed, x, y, z, 34656, x / z) < 0.001) {
							createTree(world, hash, x, y, z, seed);
						} else if (hash(seed, y, x, z, 4774, x / z) < 0.004) {
							createClassicTree(world, hash, x, y, z, seed);
						}
					}
				}
			}
		}

		createOres(world, hash, seed);

		{
			const [x, _y, z] = world.getSize();
			world.setSpawnPoint(x / 2, world.getHighestBlock(x / 2, z / 2, true) + 1, z / 2, 0, 0);
		}

		await sendDataToMain(worker, world);

		worker.close();
	};
} else {
	console.error(`Some code tried to access generator module without a worker! This shouldn't happen!`);
}
