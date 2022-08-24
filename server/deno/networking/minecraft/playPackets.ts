import { ConnectionHandler } from '../../../core/networking/connection.ts';
import { Player } from '../../../core/player.ts';
import { Server } from '../../../core/server.ts';
import { Holder, Nullable, XYZ } from '../../../core/types.ts';
import { World } from '../../../core/world/world.ts';
import type { MCProtocolHandler, PacketHandler } from './handler.ts';
import { BitSet, PacketWriter } from './packet.ts';
import * as nbt from '../../../libs/nbt/index.ts';
import * as uuidUtils from '../../../core/uuid.ts';
import { ChunkSection } from './chunk/chunkSection.ts';
import { BitStorage } from './chunk/bitStorage.ts';
import { cBlockToBlockState, barrierId, itemToCBlock, blockToItem } from './translationMap.ts';
//import { blockRegistry } from './registry.ts';
import * as vec from '../../../libs/vec.ts';
import { blocksIdsToName } from '../../../core/world/blocks.ts';

export const playPackets: PacketHandler[] = [];

interface ItemStackData {
	present: boolean;
	id: number;
	count: number;
	nbt?: nbt.TagObject;
}

const directions = [
	[0, -1, 0],
	[0, 1, 0],
	[0, 0, -1],
	[0, 0, 1],
	[-1, 0, 0],
	[1, 0, 0],
];

// Command packet
playPackets[0x04] = (handler, data) => {
	handler.player?._action_chat_message('/' + data.readString());

	// Lots of ignored data goes here
};

// Chat Message packet
playPackets[0x05] = (handler, data) => {
	handler.player?._action_chat_message(data.readString());

	// Lots of ignored data goes here
};

// Player Action
playPackets[0x1d] = (handler, data) => {
	const status = data.readVarInt();
	const pos = data.readPosition();

	switch (status) {
		case 0: {
			handler.data.minePos = pos;
			handler.data.mineTime = Date.now();
			break;
		}
		case 1: {
			handler.data.minePos = null;
			handler.data.mineTime = null;
			break;
		}
		case 2: {
			if (handler.player?.world.isInBounds(pos[0], pos[1], pos[2])) {
				const oldBlock = handler.player?.world.getBlockId(pos[0], pos[1], pos[2]);
				if (handler.player?._action_block_break(pos[0], pos[1], pos[2])) {
					handler.send(packet.worldEvent(2001, pos, cBlockToBlockState[oldBlock], false));
				}
			} else {
				handler.send(packet.setBlock(pos[0], pos[1], pos[2], barrierId));
			}
			handler.data.minePos = null;
			handler.data.mineTime = null;
			break;
		}
	}
};

// Interact
playPackets[0x10] = (_handler, _data) => {};

// Set Player Position
playPackets[0x14] = (handler, data) => {
	handler.player?._action_move(data.readDouble(), data.readDouble(), data.readDouble(), handler.player.yaw, handler.player.pitch);
};

// Set Player Position and Rotation
playPackets[0x15] = (handler, data) => {
	handler.player?._action_move(
		data.readDouble(),
		data.readDouble(),
		data.readDouble(),
		(((data.readFloat() + 180) % 360) / 360) * 256,
		(data.readFloat() / 360) * 256
	);
};

// Set Player Rotation
playPackets[0x16] = (handler, data) => {
	handler.player?._action_move(
		handler.player.position[0],
		handler.player.position[1],
		handler.player.position[2],
		(((data.readFloat() + 180) % 360) / 360) * 256,
		(data.readFloat() / 360) * 256
	);
};

// Set Held Item
playPackets[0x28] = (handler, data) => {
	handler.inventorySlot = data.readShort();
};

// Set Creative Mode Slot
playPackets[0x2b] = (handler, data) => {
	const slot = data.readShort();

	if (slot <= 45 && slot >= 0) {
		const id = data.readBool() ? data.readVarInt() : 0;

		if (id != 0 && itemToCBlock[id] != null) {
			//const count = data.readByte();
			//const nbtData = nbt.decode(data.buffer)
			handler.inventory[slot] = id;

			handler.send(packet.setSlot(0, 0, slot, createItem(id)));
		} else {
			handler.inventory[slot] = 0;
			handler.send(packet.setSlot(0, 0, slot, { id: 0, count: 0, present: false }));
		}
	}
};

// Use Item On
playPackets[0x31] = (handler, data) => {
	const item = handler.inventory[handler.inventorySlot + 36];
	const _hand = data.readVarInt();
	const pos = data.readPosition();
	const faceId = data.readVarInt();
	const _cursorX = data.readFloat();
	const _cursorY = data.readFloat();
	const _cursorZ = data.readFloat();
	const inside = data.readBool();
	const sequence = data.readVarInt();

	if (item != 0 && !inside) {
		const face = directions[faceId];
		const block = itemToCBlock[item];
		const blockPos: XYZ = [pos[0] + face[0], pos[1] + face[1], pos[2] + face[2]];

		if (block != null && !(block.solid && handler.player?.checkColisionBox(blockPos, vec.add(blockPos, [1, 1, 1])))) {
			handler.player?._action_block_place(blockPos[0], blockPos[1], blockPos[2], block.numId);
		} else {
			handler.player?._connectionHandler.setBlock(
				blockPos[0],
				blockPos[1],
				blockPos[2],
				handler.player?.world.getBlockId(blockPos[0], blockPos[1], blockPos[2])
			);
		}
	}

	handler.send(packet.acknowledgeBlockChange(sequence));
};

export class ModernConnectionHandler implements ConnectionHandler {
	private _player: Nullable<Player> = null;
	private _port: number;
	private _ip: string;
	private _server: Server;
	private _handler: MCProtocolHandler;

	constructor(handler: MCProtocolHandler, server: Server, ip: string, port: number) {
		this._server = server;
		this._ip = ip;
		this._port = port;
		this._handler = handler;
	}

	tick() {
		const now = Date.now();
		if (now % 2 == 0) {
			this._handler.send(packet.keepAlive(now));
		}

		if (this._handler.data.minePos && this._handler.data.mineTime && now - this._handler.data.mineTime > 200) {
			const pos = this._handler.data.minePos;
			if (this._handler.player?.world.isInBounds(pos[0], pos[1], pos[2])) {
				//const oldBlock = this._handler.player?.world.getBlockId(pos[0], pos[1], pos[2]);
				if (this._handler.player?._action_block_break(pos[0], pos[1], pos[2])) {
					//this._handler.send(packet.worldEvent(2001, pos, cBlockToBlockState[oldBlock], false));
				}
			} else {
				this._handler.send(packet.setBlock(pos[0], pos[1], pos[2], barrierId));
			}

			this._handler.data.minePos = null;
			this._handler.data.mineTime = null;
		}
	}

	setPlayer(player: Player): void {
		this._player = player;
		this._handler.player = player;

		this._handler.send(packet.joinGame(this._player, this._server, player.world));
		this._handler.send(packet.pluginMessage('minecraft:brand').writeString(this._server.softwareName + ' ' + this._server.softwareVersion));
		this._handler.send(packet.updatePlayerListTexts(patchText(this._server.config.serverName), patchText(this._server.config.serverMotd)));
	}

	getPlayer(): Nullable<Player> {
		return this._player;
	}

	async sendWorld(world: World): Promise<void> {
		if (!this._player) {
			throw 'Player is not set!';
		}

		const worldSize = world.getSize();
		await sleep(1);
		this._handler.send(packet.joinGame(this._player, this._server, world));
		this._handler.send(packet.respawn(world));

		{
			const classicItems: number[] = [];

			for (const item of blockToItem) {
				if (item != null && itemToCBlock[item.id]?.placeable) {
					classicItems.push(item.id);
				}
			}

			this._handler.send(
				packet.updateTags([
					{
						type: 'minecraft:item',
						values: [
							{
								id: 'classic',
								values: classicItems,
							},
						],
					},
					{
						type: 'minecraft:fluid',
						values: [
							{
								id: 'water',
								values: [1, 2],
							},
							{
								id: 'lava',
								values: [3, 4],
							},
						],
					},
				])
			);
		}

		this._handler.send(
			new PacketWriter()
				.writeVarInt(0x0f) // Commands
				.writeVarInt(2) // Count

				.writeByte(0) // Flags
				.writeVarInt(1) // Children Count
				.writeVarInt(1) // Children Id

				.writeByte(2) // Flags
				.writeVarInt(0) // Children Count
				.writeString("command") // Name
				.writeVarInt(5) // Type
				.writeVarInt(2) // SubType

				.writeVarInt(0) // root index
		);

		this._handler.send(packet.updateViewDistance(Math.ceil(Math.max(world.getSize()[0], world.getSize()[2]) / 32 + 2)));
		this._handler.send(packet.updateTickDistance(Math.ceil(Math.max(world.getSize()[0], world.getSize()[2]) / 32 + 2)));
		this._handler.send(packet.updateViewPos(worldSize[0] / 32, worldSize[2] / 32));
		await sleep(1);

		const heightMapBits = Math.ceil(Math.log2(worldSize[1] + 2));

		for (let cx = -1; cx < worldSize[0] / 16 + 1; cx++) {
			for (let cz = -1; cz < worldSize[2] / 16 + 1; cz++) {
				const chunkSections = [];
				const heighmap = new BitStorage(heightMapBits, 16 * 16);
				for (let cy = -1; cy < worldSize[1] / 16; cy++) {
					const section = new ChunkSection();
					chunkSections.push(section);

					for (let x = 0; x < 16; x++) {
						for (let y = 0; y < 16; y++) {
							for (let z = 0; z < 16; z++) {
								if (world.isInBounds(cx * 16 + x, cy * 16 + y, cz * 16 + z)) {
									section.setBlock(x, y, z, cBlockToBlockState[world.getBlockId(cx * 16 + x, cy * 16 + y, cz * 16 + z)] ?? 0);
								} else {
									section.setBlock(x, y, z, barrierId);
								}
							}
						}
					}
				}

				const packet = new PacketWriter().writeVarInt(0x21).writeInt(cx).writeInt(cz);
				packet.writeNbt({ MOTION_BLOCKING: heighmap.toLongArray() });
				let sectionBytes = 0;

				for (const section of chunkSections) {
					sectionBytes += ChunkSection.writeSize(section);
				}

				packet.writeVarInt(sectionBytes);

				for (const section of chunkSections) {
					ChunkSection.write(packet, section);
				}

				packet.writeVarInt(0);

				packet.writeBool(true);

				const emptyLightSet = new BitSet(chunkSections.length + 2);
				packet.writeLongArray(emptyLightSet.words);
				packet.writeLongArray(emptyLightSet.words);
				packet.writeLongArray(emptyLightSet.words);
				packet.writeLongArray(emptyLightSet.words);

				packet.writeVarInt(0);
				packet.writeVarInt(0);

				this._handler.send(packet);
				await sleep(10);
			}
		}
		world.players.forEach((p) => this.sendSpawnPlayer(p));

		this._handler.send(packet.playerListAdd(this._player, this._handler.selfUuid));

		await sleep(1);

		await this.sendTeleport(this._player, [world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z], world.spawnPoint.yaw, world.spawnPoint.pitch);

		this._handler.send(packet.abilities(true, false, false, true, 0.05, 0.1));
		await sleep(1);
	}

	setBlock(x: number, y: number, z: number, block: number): void {
		this._handler.send(packet.setBlock(x, y, z, cBlockToBlockState[block] ?? 0));
	}

	sendMessage(player: Nullable<Player>, text: string): void {
		this._handler.send(packet.chatMessage(patchText(text)));
	}

	disconnect(message: string): void {
		try {
			if (this._player?.isConnected) {
				this._player?.disconnect();
				return;
			}

			if (this._player) {
				this._server?.logger.conn(`User ${this._ip}:${this._port} (${this._player.username}) disconnected! Reason ${message}`);
			}
			this._handler.send(packet.disconnect(patchText(message)));
			this._handler.close();
		} catch (_e) {
			// noop
		}
	}

	sendTeleport(player: Player, pos: XYZ, yaw: number, pitch: number): void {
		this._handler.send(packet.teleport(player.numId, pos[0], pos[1], pos[2], (yaw + 128) % 256, pitch, false));
		this._handler.send(packet.rotateHead(player.numId, (yaw + 128) % 256));
	}

	sendMove(player: Player, pos: XYZ, yaw: number, pitch: number): void {
		if (player != this._player) {
			this._handler.send(packet.teleport(player.numId, pos[0], pos[1], pos[2], (yaw + 128) % 256, pitch, false));
			this._handler.send(packet.rotateHead(player.numId, (yaw + 128) % 256));
		}
	}

	sendSpawnPlayer(player: Player): void {
		if (player != this._player) {
			this._handler.send(packet.playerListAdd(player));
			this._handler.send(packet.spawnPlayer(player));
		}
	}

	sendDespawnPlayer(player: Player): void {
		if (player != this._player) {
			this._handler.send(packet.removeEntity(player.numId));
			this._handler.send(packet.playerListRemove(player.numId));
		}
	}

	getPort(): number {
		return this._port;
	}

	getIp(): string {
		return this._ip;
	}

	getClient(): string {
		return 'Minecraft 1.19';
	}
}

export const packet = {
	pluginMessage: (channel: string) => new PacketWriter().writeVarInt(0x16).writeIdentifier(channel),
	keepAlive: (time: number) => new PacketWriter().writeVarInt(0x20).writeLong(BigInt(time)),
	spawnPlayer: (player: Player, uuidOverride?: string) =>
		new PacketWriter()
			.writeVarInt(0x02)
			.writeVarInt(player.numId)
			.writeUUID(uuidOverride ?? entityIdToUuid(player.numId))
			.writeDouble(player.position[0])
			.writeDouble(player.position[1])
			.writeDouble(player.position[2])
			.writeByte(player.yaw)
			.writeByte(player.pitch),

	removeEntities: (ids: number[]) => new PacketWriter().writeVarInt(0x3b).writeIntArray(ids),
	removeEntity: (id: number) => new PacketWriter().writeVarInt(0x3b).writeVarInt(1).writeVarInt(id),

	updatePlayerListTexts: (header: Holder<unknown>, footer: Holder<unknown>) =>
		new PacketWriter().writeVarInt(0x63).writeString(JSON.stringify(header)).writeString(JSON.stringify(footer)),

	playerListAdd: (player: Player, uuidOverride?: string) =>
		new PacketWriter()
			.writeVarInt(0x37)
			.writeVarInt(0x0)
			.writeVarInt(0x1)
			.writeUUID(uuidOverride ?? entityIdToUuid(player.numId))

			.writeString(player.username.substring(0, Math.min(16, player.username.length)))

			.writeVarInt(0)
			//.writeVarInt(2)

			//.writeString('id')
			//.writeString(uuidOverride ?? entityIdToUuid(player.numId))
			//.writeBool(false)

			//.writeString('name')
			//.writeString(player.username.substring(0, Math.min(16, player.username.length)))
			//.writeBool(false)

			.writeVarInt(0x0)
			.writeVarInt(0x0)
			.writeBool(true)
			.writeString(`{"text":"${player.username}"}`)
			.writeBool(false),
	abilities: (invulnerable: boolean, flying: boolean, canFly: boolean, instaBreak: boolean, flyingSpeed: number, fov: number) => {
		let flags = 0;

		if (invulnerable) {
			flags |= 0x1;
		}

		if (flying) {
			flags |= 0x2;
		}

		if (canFly) {
			flags |= 0x4;
		}

		if (instaBreak) {
			flags |= 0x8;
		}

		return new PacketWriter().writeVarInt(0x31).writeByte(flags).writeFloat(flyingSpeed).writeFloat(fov);
	},

	playerListRemove: (player: number) => new PacketWriter().writeVarInt(0x37).writeVarInt(0x4).writeVarInt(0x1).writeUUID(entityIdToUuid(player)),

	entityStatus: (id: number, status: number) => new PacketWriter().writeVarInt(0x1a).writeInt(id).writeByte(status),
	disconnect: (text: Holder<unknown>) => new PacketWriter().writeVarInt(0x19).writeString(JSON.stringify(text)),
	heldItemSlot: (slot: number) => new PacketWriter().writeVarInt(0x4a).writeByte(slot),
	setSlot: (window: number, stateId: number, slot: number, itemStack: ItemStackData) => {
		const builder = new PacketWriter().writeVarInt(0x13).writeByte(window).writeVarInt(stateId).writeShort(slot);

		if (itemStack.present) {
			builder.writeBool(true);
			builder.writeVarInt(itemStack.id);
			builder.writeByte(itemStack.count);

			if (itemStack.nbt) {
				builder.writeNbt(itemStack.nbt);
			} else {
				builder.writeByte(0);
			}
		} else {
			builder.writeBool(false);
		}

		return builder;
	},
	updateViewPos: (x: number, z: number) => new PacketWriter().writeVarInt(0x4b).writeVarInt(x).writeVarInt(z),
	setBlock: (x: number, y: number, z: number, block: number) => new PacketWriter().writeVarInt(0x09).writePosition([x, y, z]).writeVarInt(block),
	acknowledgeBlockChange: (id: number) => new PacketWriter().writeVarInt(0x05).writeVarInt(id),
	chatMessage: (text: Holder<unknown>) => new PacketWriter().writeVarInt(0x62).writeString(JSON.stringify(text)).writeByte(0),
	actionbar: (text: Holder<unknown>) => new PacketWriter().writeVarInt(0x62).writeString(JSON.stringify(text)).writeByte(1),

	teleport: (entityId: number, x: number, y: number, z: number, yaw: number, pitch: number, onGround: boolean) =>
		new PacketWriter()
			.writeVarInt(0x66)
			.writeVarInt(entityId)
			.writeDouble(x)
			.writeDouble(y)
			.writeDouble(z)
			.writeByte(yaw)
			.writeByte(pitch)
			.writeBool(onGround),

	rotateHead: (entityId: number, yaw: number) => new PacketWriter().writeVarInt(0x3f).writeVarInt(entityId).writeByte(yaw),

	respawn: (world: World) =>
		new PacketWriter()
			.writeVarInt(0x3e)
			.writeIdentifier('w:' + world.fileName.toLocaleLowerCase())
			.writeIdentifier('w:' + world.fileName.toLocaleLowerCase())
			.writeLong(0n)
			.writeByte(0x01) // Gamemode
			.writeByte(0)
			.writeBool(false)
			.writeBool(true)
			.writeBool(true)
			.writeBool(false),

	worldEvent: (id: number, position: XYZ, data: number, noDistance: boolean) =>
		new PacketWriter().writeVarInt(0x23).writeInt(id).writePosition(position).writeInt(data).writeBool(noDistance),

	updateViewDistance: (distance: number) => new PacketWriter().writeVarInt(0x4c).writeVarInt(distance),

	updateTickDistance: (distance: number) => new PacketWriter().writeVarInt(0x5a).writeVarInt(distance),

	joinGame: (player: Player, server: Server, world: World) =>
		new PacketWriter()
			.writeVarInt(0x25)
			.writeInt(player.numId)
			.writeBool(false)
			.writeByte(0x01) // Gamemode
			.writeByte(0x01)
			.writeVarInt(1)
			.writeIdentifier('w:' + world.fileName.toLocaleLowerCase())
			.writeNbt(createRegistryCodec(server, world))
			.writeIdentifier('w:' + world.fileName.toLocaleLowerCase())
			.writeIdentifier('w:' + world.fileName.toLocaleLowerCase())
			.writeLong(0n)
			.writeVarInt(server.config.maxPlayerCount)
			.writeVarInt(Math.ceil(Math.max(world.getSize()[0], world.getSize()[2]) / 32 + 2))
			.writeVarInt(Math.ceil(Math.max(world.getSize()[0], world.getSize()[2]) / 32 + 2))
			.writeBool(false)
			.writeBool(true)
			.writeBool(false)
			.writeBool(true)
			.writeBool(false),

	updateTags: (tags: { type: string; values: { id: string; values: number[] }[] }[]) => {
		const p = new PacketWriter().writeVarInt(0x6b).writeVarInt(tags.length);

		for (const tagGroup of tags) {
			p.writeIdentifier(tagGroup.type);
			p.writeVarInt(tagGroup.values.length);

			for (const tagList of tagGroup.values) {
				p.writeIdentifier(tagList.id);
				p.writeVarInt(tagList.values.length);

				for (const id of tagList.values) {
					p.writeVarInt(id);
				}
			}
		}

		return p;
	},
};

function createRegistryCodec(_server: Server, world: World): nbt.TagObject {
	return {
		'minecraft:dimension_type': {
			type: 'minecraft:dimension_type',
			value: [
				{
					element: createDimType(world),
					id: new nbt.Int(0),
					name: 'w:' + world.fileName.toLocaleLowerCase(),
				},
			],
		},
		'minecraft:worldgen/biome': {
			type: 'minecraft:worldgen/biome',
			value: [
				{
					element: {
						category: 'forest',
						downfall: new nbt.Float(0.8),
						effects: {
							mood_sound: {
								block_search_extent: new nbt.Int(8),
								offset: 2.0,
								sound: 'ambient.cave',
								tick_delay: new nbt.Int(6000),
							},
							grass_color: new nbt.Int(0x7ecf2d),
							foliage_color: new nbt.Int(0x7ecf2d),
							sky_color: new nbt.Int(0x9accff),
							fog_color: new nbt.Int(0xd0e7ff),
							water_color: new nbt.Int(4159204),
							water_fog_color: new nbt.Int(329011),
						},
						precipitation: 'rain',
						temperature: new nbt.Float(0.7),
					},
					id: new nbt.Int(0),
					name: 'minecraft:plains',
				},
			],
		},
		'minecraft:chat_type': {
			type: 'minecraft:chat_type',
			value: [
				{
					element: {
						chat: {
							translation_key: 'chat.type.text',
							parameters: ['sender', 'content'],
						},
						narration: {
							translation_key: 'chat.type.text.narrate',
							parameters: ['sender', 'content'],
						},
					},
					id: new nbt.Int(0),
					name: 'minecraft:chat',
				},
			],
		},
	};
}

function createDimType(world: World): nbt.TagObject {
	return {
		ambient_light: new nbt.Float(0),
		bed_works: new nbt.Byte(1),
		coordinate_scale: new nbt.Int(1),
		effects: 'minecraft:overworld',
		has_ceiling: new nbt.Byte(0),
		has_raids: new nbt.Byte(0),
		has_skylight: new nbt.Byte(1),
		height: new nbt.Int(world.getSize()[1] + 16),
		infiniburn: '#minecraft:infiniburn_overworld',
		logical_height: new nbt.Int(world.getSize()[1]),
		min_y: new nbt.Int(-16),
		natural: new nbt.Byte(0),
		piglin_safe: new nbt.Byte(0),
		respawn_anchor_works: new nbt.Byte(1),
		ultrawarm: new nbt.Byte(0),
		monster_spawn_light_level: new nbt.Int(0),
		monster_spawn_block_light_limit: new nbt.Int(0),
	};
}

function sleep(n: number) {
	return new Promise((r) => setTimeout(r, n));
}

export function entityIdToUuid(id: number) {
	return uuidUtils.bytesToString([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, id]);
}

export function patchText(text: string): Holder<unknown> {
	return { text: text.replaceAll('&', '§') };
}

function getFancyName(arg0: string) {
	const result = arg0.replace(/([A-Z])/g, ' $1');
	return result.charAt(0).toUpperCase() + result.slice(1);
}

function createItem(id: number): ItemStackData {
	return {
		present: true,
		id: id,
		count: 1,
		nbt: {
			display: {
				Name: itemToCBlock[id]
					? `{"text": "${getFancyName(blocksIdsToName[itemToCBlock[id].numId])}", "italic": false, "color":"${
							itemToCBlock[id].placeable ? 'white' : 'gray'
					  }"}`
					: `{"text": "INVALID", "italic": false, "color":"red"}`,
			},
		},
	};
}
