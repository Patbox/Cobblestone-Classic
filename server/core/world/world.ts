import type { Player } from '../player.ts';
import { Server } from '../server.ts';
import type { Nullable, Position, Services, XYZ } from '../types.ts';

import { Byte, decode as decodeNBT, encode as encodeNBT, Short, TagObject } from '../../libs/nbt/index.ts';

import { uuid, uuidHelpers } from '../deps.ts';
import { Block, lastBlockId } from './blocks.ts';

export interface IWorldView {
	setBlock(x: number, y: number, z: number, block: Block): boolean;
	setBlockId(x: number, y: number, z: number, block: number): boolean;
	getBlock(x: number, y: number, z: number): Nullable<Block>;
	getBlockId(x: number, y: number, z: number): number;
	isInBounds(x: number, y: number, z: number): boolean;
	getHighestBlock(x: number, z: number, nonSolid?: boolean): number;
	getRawBlockData(): Uint8Array;
	getSize(): XYZ;
	getSpawnPoint(): Position;
	setSpawnPoint(x: number, y: number, z: number, yaw: number, pitch: number): void;
}

export class WorldView implements IWorldView {
	readonly blockData: Uint8Array;

	readonly size: [number, number, number];
	spawnPoint: Position;

	constructor(blockData: Nullable<Uint8Array>, sizeX: number, sizeY: number, sizeZ: number, spawnPoint?: Position) {
		const size = sizeX * sizeY * sizeZ;

		this.blockData = blockData ?? new Uint8Array(size);

		this.size = [sizeX, sizeY, sizeZ];

		this.spawnPoint = spawnPoint ?? { x: sizeX / 2, y: sizeY / 2 + 10, z: sizeZ / 2, yaw: 0, pitch: 0 };
	}

	setBlock(x: number, y: number, z: number, block: Block): boolean {
		return this.setBlockId(x, y, z, block.numId);
	}

	setBlockId(x: number, y: number, z: number, block: number): boolean {
		if (this.isInBounds(x, y, z)) {
			block = block > lastBlockId || block < 0 ? 1 : block;
			this._rawSetBlockId(x, y, z, block);
			return true;
		} else {
			return false;
		}
	}

	_rawSetBlockId(x: number, y: number, z: number, block: number) {
		this.blockData[this.getIndex(x, y, z)] = block;
	}

	getBlock(x: number, y: number, z: number): Nullable<Block> {
		return Server.getBlock(this.getBlockId(x, y, z));
	}

	getBlockId(x: number, y: number, z: number): number {
		const [x2, y2, z2] = roundDown(x, y, z);
		return this.isInBounds(x2, y2, z2) ? this.blockData[this.getIndex(x2, y2, z2)] : 0;
	}

	isInBounds(x: number, y: number, z: number): boolean {
		const [x2, y2, z2] = roundDown(x, y, z);
		return x2 >= 0 && y2 >= 0 && z2 >= 0 && x2 < this.size[0] && y2 < this.size[1] && z2 < this.size[2];
	}

	getHighestBlock(x: number, z: number, nonSolid = false): number {
		for (let y = this.size[1] - 1; y > 0; y--) {
			const block = this.getBlock(x, y, z);
			if (block?.solid || (nonSolid && block?.numId != 0)) {
				return y;
			}
		}

		return 0;
	}

	getIndex(x: number, y: number, z: number): number {
		const [x2, y2, z2] = roundDown(x, y, z);
		return x2 + this.size[0] * (z2 + this.size[2] * y2);
	}

	getRawBlockData() {
		return this.blockData;
	}

	getSize() {
		return this.size;
	}

	getSpawnPoint() {
		return this.spawnPoint;
	}

	setSpawnPoint(x: number, y: number, z: number, yaw: number, pitch: number): void {
		this.spawnPoint = {
			x: x,
			y: y,
			z: z,
			yaw: yaw,
			pitch: pitch,
		};
	}
}

export class World extends WorldView {
	readonly uuid: string;
	readonly fileName: string;
	readonly players: Set<Player> = new Set();

	name: string;

	readonly timeCreated: bigint;
	readonly createdBy: {
		service: Services;
		username: string;
		uuid: string;
	};

	readonly generator: {
		readonly software: string;
		readonly type: string;
	};

	lastModified: bigint;

	_metadata: TagObject;
	readonly _server: Server;
	protected blocksToUpdate: [number, number, number, Block][] = [];
	protected lazyBlocksToUpdate: [number, number, number, Block][] = [];

	physics: PhysicsLevel;

	constructor(fileName: string, data: WorldData, server: Server) {
		super(data.blockData ?? null, data.size[0], data.size[1], data.size[2], data.spawnPoint);
		this._server = server;

		this.fileName = fileName;
		this.uuid = data.uuid ?? uuid.v4.generate();
		this.name = data.name ?? fileName;

		this.timeCreated = data.timeCreated ?? BigInt(Date.now());
		this.generator = data.generator;
		this.createdBy = data.createdBy ?? { service: 'Unknown', username: server.softwareName, uuid: 'unknown' };

		this.lastModified = data.lastModified ?? BigInt(Date.now());

		this._metadata = data._metadata ?? {};
		this.physics = data.physics;
	}

	setBlockId(x: number, y: number, z: number, block: number): boolean {
		const out = super.setBlockId(x, y, z, block);
		if (out) {
			this.players.forEach((p) => p._connectionHandler.setBlock(x, y, z, block));
		}

		return out;
	}

	save() {
		this._server.saveWorld(this);
	}

	backup() {
		this._server.files.saveWorld(`backup/${this.fileName}-${this._server.formatDate(new Date())}`, this);
	}

	clone(newName: string): World {
		const worldnames = this._server.files.listWorlds();

		let name = newName;
		let number = 0;

		while (worldnames.includes(name)) {
			number++;
			name = newName + '_' + number;
		}
		
		const world = World.deserialize(this.serialize());

		if (world == null) {
			throw 'Somewhing went wrong while clonning world!';
		}

		return new World(name, world, this._server);
	}

	teleportAllPlayers(world: World, x?: number, y?: number, z?: number, yaw?: number, pitch?: number) {
		if (z != undefined && y != undefined && x != undefined) {
			this.players.forEach((p) => p.teleport(world, x, y, z, yaw, pitch));
		} else {
			this.players.forEach((p) => p.changeWorld(world));
		}
	}

	tickBlock(x: number, y: number, z: number) {
		const b = this.getBlock(x, y, z);

		if (b && b.tickable) {
			this.blocksToUpdate.push([x, y, z, b]);
		}
	}

	lazyTickBlock(x: number, y: number, z: number) {
		const b = this.getBlock(x, y, z);

		if (b && b.tickable) {
			this.lazyBlocksToUpdate.push([x, y, z, b]);
		}
	}

	lazyTickNeighborBlocksAndSelf(x: number, y: number, z: number) {
		for (let x2 = -1; x2 <= 1; x2++) {
			for (let y2 = -1; y2 <= 1; y2++) {
				for (let z2 = -1; z2 <= 1; z2++) {
					this.lazyTickBlock(x + x2, y + y2, z + z2);
				}
			}
		}
	}

	_tick(tick: bigint) {
		if (this.physics == PhysicsLevel.NONE) {
			this.blocksToUpdate = [];
			this.lazyBlocksToUpdate = [];
		}

		for (let i = 0; i < 1000; i++) {
			const x = Math.floor(Math.random() * this.size[0]);
			const y = Math.floor(Math.random() * this.size[1]);
			const z = Math.floor(Math.random() * this.size[2]);
			this.tickBlock(x, y, z);
		}

		this.blocksToUpdate = this.blocksToUpdate.filter(([x, y, z, block]) => !block.update(this, x, y, z, false, tick));

		if (tick % 20n == 0n) {
			const b = this.lazyBlocksToUpdate.shift();

			if (b) {
				const [x, y, z, block] = b;
				if (!block.update(this, x, y, z, true, tick)) {
					this.lazyBlocksToUpdate.push(b);
				}
			}
		}
	}

	_addPlayer(player: Player) {
		this.players.add(player);
		player.isInWorld = true;
		this.players.forEach((p) => p._connectionHandler.sendSpawnPlayer(player));
	}

	_removePlayer(player: Player) {
		this.players.delete(player);

		this.players.forEach((p) => p._connectionHandler.sendDespawnPlayer(player));
	}

	_movePlayer(player: Player, pos: XYZ, yaw: number, pitch: number) {
		this.players.forEach((p) => (p == player ? null : p._connectionHandler.sendMove(player, pos, yaw, pitch)));
	}

	serialize(): Uint8Array {
		return encodeNBT('ClassicWorld', {
			FormatVersion: new Byte(1),
			Name: this.name,
			UUID: uuidHelpers.uuidToBytes(this.uuid),
			X: new Short(this.size[0]),
			Y: new Short(this.size[1]),
			Z: new Short(this.size[2]),
			Spawn: {
				X: new Short(Math.floor(this.spawnPoint.x * 32)),
				Y: new Short(Math.floor(this.spawnPoint.y * 32)),
				Z: new Short(Math.floor(this.spawnPoint.z * 32)),
				H: new Byte(this.spawnPoint.yaw),
				P: new Byte(this.spawnPoint.pitch),
			},
			BlockArray: this.blockData,
			Metadata: {
				...this._metadata,
				Cobblestone: {
					PhysicsLevel: new Byte(this.physics),
				},
			},
			TimeCreated: this.timeCreated,
			LastModified: this.lastModified,
			CreatedBy: {
				Service: this.createdBy.service,
				Username: this.createdBy.username,
				UUID: this.createdBy.uuid,
			},
			MapGenerator: {
				Software: this.generator.software,
				MapGeneratorName: this.generator.type,
			},
		});
	}

	static deserialize(data: Uint8Array): Nullable<WorldData> {
		try {
			const decoded = decodeNBT(data);

			const main = <TagObject>decoded.value;

			const id = uuidHelpers.bytesToUuid(<Uint8Array>main.UUID);
			const blocks = <Uint8Array>main.BlockArray;
			const blocks2 = <Uint8Array | undefined>main.BlockArray2;

			const spawn = <{ [i: string]: { value: number } }>main.Spawn;
			const createdBy = <{ Service?: Services; Username?: string; UUID?: string }>main.CreatedBy;
			const generator = <{ Software?: string; MapGeneratorName: string }>main.MapGenerator;

			const blockData = new Uint8Array(blocks.length);

			const metadata = <TagObject>main?.Metadata ?? {};

			const fallback: Uint8Array | undefined = <Uint8Array>(<TagObject>(<TagObject>metadata.CPE)?.CustomBlocks)?.Fallback;

			let getBlockAt = (x: number) => blocks[x];

			if (blocks2) {
				getBlockAt = (x: number) => {
					return blocks[x] | (blocks2[x] << 8);
				};
			}

			if (fallback != undefined) {
				for (let x = 0; x < blocks.length; x++) {
					blockData[x] = fallback[getBlockAt(x)] ?? 0;
				}
			} else {
				for (let x = 0; x < blocks.length; x++) {
					blockData[x] = blocks[x] ?? 0;
				}
			}

			for (let x = 0; x < blockData.length; x++) {
				if (blockData[x] > lastBlockId) {
					blockData[x] = 1;
				}
			}

			const physics = (<Byte>(<TagObject>metadata?.['Cobblestone'])?.['PhysicsLevel'])?.valueOf();

			return {
				uuid: id,
				name: main?.Name as string,
				blockData: blockData,
				size: [(<Short>main.X).value, (<Short>main.Y).value, (<Short>main.Z).value],
				spawnPoint: { x: spawn.X.value / 32, y: spawn.Y.value / 32, z: spawn.Z.value / 32, yaw: spawn.H.value, pitch: spawn.P.value },
				createdBy: {
					service: createdBy?.Service ?? 'Unknown',
					username: createdBy?.Username ?? 'Unknown',
					uuid: createdBy?.UUID ?? 'Unknown',
				},
				timeCreated: <bigint>main?.TimeCreated ?? Date.now(),
				lastModified: <bigint>main?.LastModified ?? Date.now(),
				generator: {
					software: generator?.Software ?? 'Unknown',
					type: generator?.MapGeneratorName ?? 'Unknown',
				},

				_metadata: metadata,
				physics: physics ?? PhysicsLevel.NONE,
			};
		} catch (_e) {
			return null;
		}
	}
}

function roundDown(x: number, y: number, z: number): [number, number, number] {
	return [Math.floor(x), Math.floor(y), Math.floor(z)];
}

export interface WorldGenerator {
	name: string;
	software: string;
	generate: (sizeX: number, sizeY: number, sizeZ: number, seed?: number) => Promise<WorldView>;
}

export interface WorldData {
	size: [number, number, number];
	name?: string;
	uuid?: string;
	blockData?: Uint8Array;
	createdBy?: {
		service: Services;
		username: string;
		uuid: string;
	};

	generator: {
		software: string;
		type: string;
	};

	timeCreated?: bigint;
	lastModified?: bigint;

	_metadata?: TagObject;

	spawnPoint: Position;

	physics: PhysicsLevel;
}

export enum PhysicsLevel {
	NONE,
	BASIC,
	NO_FLUIDS,
	FULL,
}
