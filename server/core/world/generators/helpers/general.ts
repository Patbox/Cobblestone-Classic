import { Position } from '../../../types.ts';
import { WorldView } from '../../world.ts';

export function createWorkerGenerator(pos: URL): (sizeX: number, sizeY: number, sizeZ: number, seed?: number) => Promise<WorldView> {
	return (sizeX: number, sizeY: number, sizeZ: number, seed?: number) => {
		return new Promise((res) => {
			const worker = new Worker(pos.href, { type: 'module' });
			worker.onmessage = (message) => {
				const data = <{ type: 'data'; blockData: Uint8Array; spawnPoint: Position }>message.data;

				res(new WorldView(data.blockData, sizeX, sizeY, sizeZ, data.spawnPoint));
			};

			worker.onerror = (e) => {
				throw e.error;
			};

			worker.postMessage({ sizeX, sizeY, sizeZ, seed });
		});
	};
}

export async function sendDataToMain(worker: Worker, world: WorldView) {
	const data = world.getRawBlockData();
	await worker.postMessage({ type: 'data', spawnPoint: world.getSpawnPoint(), blockData: data });

}
