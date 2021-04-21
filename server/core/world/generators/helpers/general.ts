import { Position } from '../../../types.ts';
import { WorldView } from '../../world.ts';

export function createWorkerGenerator(pos: URL): (sizeX: number, sizeY: number, sizeZ: number, seed?: number) => Promise<WorldView> {
	return (sizeX: number, sizeY: number, sizeZ: number, seed?: number) => {
		return new Promise((res) => {
			const worker = new Worker(pos.href, { type: 'module' });
			let blockData: Uint8Array;
			let dataPos = 0;
			let spawnPoint: Position;
			let length: number;
			worker.onmessage = (message) => {
				const data = <{ type: 'info' | 'data'; blockData: string; spawnPoint: Position; size: number }>message.data;

				if (data.type == 'info') {
					blockData = new Uint8Array(data.size);
					spawnPoint = data.spawnPoint;
					length = data.size;
				} else {
					const tmp = new TextEncoder().encode(data.blockData);
					blockData.set(tmp, dataPos);
					dataPos += tmp.length;

					if (dataPos >= length) {
						res(new WorldView(blockData, sizeX, sizeY, sizeZ, spawnPoint));
					}
				}
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
	await worker.postMessage({ type: 'info', spawnPoint: world.getSpawnPoint(), size: world.getRawBlockData().length });
	const txtDec = new TextDecoder();
	for (let i = 0; i < data.length; i += 1024) {
		const x = data.slice(i, Math.min(i + 1024, data.length));
		await worker.postMessage({ type: 'data', blockData: txtDec.decode(x) });
	}
}
