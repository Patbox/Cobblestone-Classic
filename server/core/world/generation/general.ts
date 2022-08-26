import { Position } from '../../types.ts';
import { GenerationStatusListener, WorldView } from '../world.ts';

export function createWorkerGenerator(pos: URL): (sizeX: number, sizeY: number, sizeZ: number, seed?: number, statusListener?: GenerationStatusListener) => Promise<WorldView> {
	return (sizeX: number, sizeY: number, sizeZ: number, seed?: number, statusListener?: GenerationStatusListener) => {
		return new Promise((res) => {
			const worker = new Worker(pos.href, { type: 'module' });
			worker.onmessage = (message) => {
					const data = <WorkerResponse>message.data;
				if (data.type == 'data') {
					res(new WorldView(data.blockData, sizeX, sizeY, sizeZ, data.spawnPoint));
				} else if (data.type == 'status') {
					statusListener?.(data.text, data.percentage);
				}
			};

			worker.onerror = (e) => {
				throw e.error;
			};

			worker.postMessage({ sizeX, sizeY, sizeZ, seed });
		});
	};
}

export type WorkerResponse = { type: 'data'; blockData: Uint8Array; spawnPoint: Position } | { type: 'status'; text: string; percentage: number }

export async function sendStatusToMain(worker: Worker, text: string, percentage: number) {
	await worker.postMessage({ type: 'status', text: text, percentage: percentage });
}

export async function sendDataToMain(worker: Worker, world: WorldView) {
	const data = world.getRawBlockData();
	await worker.postMessage({ type: 'data', spawnPoint: world.getSpawnPoint(), blockData: data });
}
