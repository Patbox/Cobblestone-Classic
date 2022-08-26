import { OpenSimplex } from '../../deps.ts';
import { makeMurmur } from '../../../libs/murmur.ts';
import { WorldView } from '../../world/world.ts';
import { createOres } from '../../world/generation/ores.ts';
import { sendDataToMain, sendStatusToMain } from '../../world/generation/general.ts';
import { placeTopLayer,placePlants } from "./parts/decorators.ts";

if ('onmessage' in self) {
	const worker = self as Worker & typeof self;

	worker.onmessage = async (e: MessageEvent) => {
		const seed2 = e.data.seed;
		const xSize = e.data.sizeX;
		const ySize = e.data.sizeY;
		const zSize = e.data.sizeZ;

		const size = xSize * ySize * zSize;

		let seed = Math.floor(Math.random() * 10000);
		if (seed2 != 0 && seed2 != undefined) {
			seed = seed2;
		}

		const hash = makeMurmur(seed);

		const heightNoise = OpenSimplex.makeNoise2D(Math.round(seed * 60 * Math.sin(seed ^ 3) * 10000));
		const heightNoise2 = OpenSimplex.makeNoise2D(Math.round(seed * 60 * 10000));
		const caveNoise = OpenSimplex.makeNoise3D(Math.round(seed * Math.sin(seed ^ 2) * 10000));
		const caveNoise2 = OpenSimplex.makeNoise3D(Math.round(seed * 10000));

		const tempWorld = new WorldView(null, xSize, ySize, zSize);

		sendStatusToMain(worker, 'Carving world', 0);

		let i = 0;
		for (let x = 0; x < xSize; x++) {
			for (let z = 0; z < zSize; z++) {
				const h = heightNoise(x / 120, z / 120) + 0.4 + (heightNoise2(x / 10, z / 10) + 1) / 4;
				//if ((caveNoise(x / 70, y / 70, z / 70) * (1.2 - h) + caveNoise2(x / 40, y / 40, z / 40) * h) * 16  >= 0) {
				for (let y = 0; y < ySize; y++) {
					if ((caveNoise(x / 70, y / 70, z / 70) * (1.2 - h) + caveNoise2(x / 40, y / 40, z / 40) * h) * 16 + ySize / 2 + 3 >= y) {
						tempWorld.setBlockId(x, y, z, 1);
					}
					i++;
				}

				sendStatusToMain(worker, 'Carving world', i / size * 100);
			}
		}

		const world = new WorldView(null, xSize, ySize, zSize);
		placeTopLayer(worker, tempWorld, world);
		placePlants(worker, world, seed, hash);

		sendStatusToMain(worker, 'Creating ores', 0);
		createOres(world, hash, seed);
		sendStatusToMain(worker, 'Setting spawn', 0);

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
