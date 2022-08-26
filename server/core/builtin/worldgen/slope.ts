import { WorldView } from '../../world/world.ts';
import { sendDataToMain, sendStatusToMain } from '../../world/generation/general.ts';

if ('onmessage' in self) {
	const worker = self as Worker & typeof self;

	worker.onmessage = async (e: MessageEvent) => {
		const xSize = e.data.sizeX;
		const ySize = e.data.sizeY;
		const zSize = e.data.sizeZ;

		const size = xSize * ySize * zSize;

		const tempWorld = new WorldView(null, xSize, ySize, zSize);

		const delta = ySize / 3 / zSize;

		let currentY = ySize - (ySize * 2) / 3;

		sendStatusToMain(worker, 'Carving world', 0);
		let i = 0;

		for (let z = 0; z < zSize; z++) {
			currentY += delta;
			for (let x = 0; x < xSize; x++) {
				for (let y = 0; y < currentY; y++) {
					tempWorld.setBlockId(x, y, z, 1);
					i++;
				}

				sendStatusToMain(worker, 'Carving world', i / size * 100);
			}
		}

		const world = new WorldView(null, xSize, ySize, zSize);
		i = 0;
		
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
