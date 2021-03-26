import { Server } from './server.ts';
import { World } from './world.ts';
import { blockIds } from './blocks.ts';
import { opensimplex } from './deps.ts';
import { makeMurmur } from '../libs/murmur.ts'

export function setupGenerators(server: Server) {
	server.addGenerator({
		name: 'flat',
		generate: (world: World, seed2?: number) => {
			const [xSize, ySize, zSize] = world.size;

			for (let y = 0; y < ySize; y++) {
				const block = y > ySize / 2 ? blockIds.air : y == ySize / 2 ? blockIds.grass : y > ySize / 2 - 4 ? blockIds.dirt : blockIds.stone;
				for (let x = 0; x < xSize; x++) {
					for (let z = 0; z < zSize; z++) {
						world.rawSetBlock(x, y, z, block);
					}
				}
			}
		},
	});

	server.addGenerator({
		name: 'grasslands',
		generate: (world: World, seed2?: number) => {
			let seed = Math.floor(Math.random() * 10000);
			if (seed2 != 0 && seed2 != undefined) {
				seed = seed2;
			}

			const hash = makeMurmur(seed);

			const heightNoise = opensimplex.makeNoise2D(Math.round(seed * 60 * Math.sin(seed ^ 3) * 10000));
			const heightNoise2 = opensimplex.makeNoise2D(Math.round(seed * 60 * 10000));
			const caveNoise = opensimplex.makeNoise3D(Math.round(seed * Math.sin(seed ^ 2) * 10000));
			const caveNoise2 = opensimplex.makeNoise3D(Math.round(seed * 10000));

			const [xSize, ySize, zSize] = world.size;
			const index = (x: number, y: number, z: number) => (y < 1 ? 1 : y >= ySize ? 0 : x + xSize * (z + zSize * y));

			const tempWorld = new Uint8Array(world.blockData.length - 4);

			for (let y = 0; y < ySize; y++) {
				for (let x = 0; x < xSize; x++) {
					for (let z = 0; z < zSize; z++) {
						const h = heightNoise(x / 120, z / 120) + 0.4 + (heightNoise2(x / 10, z / 10) + 1) / 4;
						if ((caveNoise(x / 70, y / 70, z / 70) * (1.2 - h) + caveNoise2(x / 40, y / 40, z / 40) * h) * 16 + ySize / 2 + 3 >= y) {
							tempWorld[index(x, y, z)] = 1;
						}
					}
				}
			}

			for (let y = 0; y < ySize; y++) {
				for (let x = 0; x < xSize; x++) {
					for (let z = 0; z < zSize; z++) {
						const b4 = tempWorld[index(x, y + 4, z)];
						const b3 = tempWorld[index(x, y + 3, z)];
						const b2 = tempWorld[index(x, y + 2, z)];
						const b1 = tempWorld[index(x, y + 1, z)];
						const b0 = tempWorld[index(x, y, z)];

						let block = 0;

						if (b0 == 1 && b1 == 0 && b2 == 0) {
							block = y > (ySize - 1) / 2 ? blockIds.grass : blockIds.sand;
						} else if (b0 + b1 + b2 + b3 + b4 == 5) {
							block = blockIds.stone;
						} else if (b0 == 1 && b1 == 1 && b4 == 0) {
							block = y <= (ySize - 1) / 2 && y + 2 <= zSize / 8 - 1 ? blockIds.sand : blockIds.dirt;
						} else {
							block = y > (ySize - 1) / 2 ? blockIds.air : blockIds.water;
						}

						world.rawSetBlock(x, y, z, block);
					}
				}
			}

			for (let y = 0; y < ySize; y++) {
				for (let x = 0; x < xSize; x++) {
					for (let z = 0; z < zSize; z++) {
						const b0 = world.getBlock(x, y, z);
						const bm1 = world.getBlock(x, y - 1, z);

						if (bm1 == blockIds.grass && b0 == blockIds.air) {
							if (hash(seed, x, y, z, 346346) < 0.1) {
								world.rawSetBlock(x, y, z, hash(seed, x, y, z, 463) >= 0.5 ? blockIds.rose : blockIds.dantelion);
							} else if (hash(seed, x, y, z, 34656) < 0.001) {
								const size = Math.round(hash(seed * 5, 5483, x, y, z));
								const height = 5 + Math.round(hash(seed, x, y, z)) + size * 2;

								for (let y2 = 0; y2 < height; y2++) {
									if (world.isInBounds(x, y + y2, z) && world.getBlock(x, y + y2, z) == 0) {
										world.rawSetBlock(x, y + y2, z, blockIds.wood);
									}
								}

								for (let x2 = -5; x2 <= 5; x2++) {
									for (let y2 = -4; y2 <= 5; y2++) {
										for (let z2 = -5; z2 <= 5; z2++) {
											if (
												world.isInBounds(x + x2, y + y2 + height - 1, z + z2) &&
												world.getBlock(x + x2, y + y2 + height - 1, z + z2) == 0 &&
												hash(5435, x + x2, y + y2 + height - 1, z + z2, seed * 2) > 0.3 &&
												dist(x2, y2, z2) <= 4 + size
											) {
												world.rawSetBlock(x + x2, y + y2 + height - 1, z + z2, blockIds.leaves);
											}
										}
									}
								}
							}
						}
					}
				}
			}
		},
	});
}

function dist(x: number, y: number, z: number): number {
	return Math.sqrt(x * x + y * y + z * z);
}
