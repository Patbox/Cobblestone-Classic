import { Emitter } from '../../../libs/emitter.ts';
import { Holder } from "../../types.ts";
import { PacketReader, PacketWriter } from './packet.ts';

export class ServerPacketHandler {
	packetIds = packetIds;
	packetLenght = packetIdsToLenght;
	packetIdsToLenght = packetIdsToLenght
	
	ServerIdentification = new Emitter<ServerIdentification>();
	Ping = new Emitter<null>();
	LevelInitialize = new Emitter<null>();
	LevelData = new Emitter<LevelData>();
	LevelFinalize = new Emitter<LevelFinalize>();
	SetBlock = new Emitter<SetBlock>();
	SpawnPlayer = new Emitter<SpawnPlayer>();
	Teleport = new Emitter<Teleport>();
	PositionAndOrientation = new Emitter<PositionAndOrientation>();
	Position = new Emitter<Position>();
	Orientation = new Emitter<Orientation>();
	DespawnPlayer = new Emitter<DespawnPlayer>();
	Message = new Emitter<Message>();
	Disconnect = new Emitter<Disconnect>();
	UserType = new Emitter<UserType>();

	Unknown = new Emitter<Uint8Array>();

	_decode(buffer: Uint8Array) {
		const reader = new PacketReader(buffer);

		switch (reader.readByte()) {
			case packetIds.ServerIdentification:
				this.ServerIdentification._emit({
					protocol: reader.readByte(),
					name: reader.readString(),
					motd: reader.readString(),
					userType: reader.readByte(),
				});
				break;
			case packetIds.Ping:
				this.Ping._emit(null);
				break;
			case packetIds.LevelInitialize:
				this.LevelInitialize._emit(null);
				break;
			case packetIds.LevelData:
				this.LevelData._emit({
					chunkLenght: reader.readShort(),
					chunkData: reader.readByteArray(),
					complite: reader.readByte(),
				});
				break;
			case packetIds.LevelFinalize:
				this.LevelFinalize._emit({
					x: reader.readShort(),
					y: reader.readShort(),
					z: reader.readShort(),
				});
				break;
			case packetIds.SetBlock:
				this.SetBlock._emit({
					x: reader.readShort(),
					y: reader.readShort(),
					z: reader.readShort(),
					block: reader.readByte(),
				});
				break;
			case packetIds.SpawnPlayer:
				this.SpawnPlayer._emit({
					player: reader.readSByte(),
					name: reader.readString(),
					x: reader.readShort(),
					y: reader.readShort(),
					z: reader.readShort(),
					yaw: reader.readByte(),
					pitch: reader.readByte(),
				});
				break;
			case packetIds.Teleport:
				this.Teleport._emit({
					player: reader.readByte(),
					x: reader.readShort(),
					y: reader.readShort(),
					z: reader.readShort(),
					yaw: reader.readByte(),
					pitch: reader.readByte(),
				});
				break;
			case packetIds.PositionAndOrientation:
				this.PositionAndOrientation._emit({
					player: reader.readByte(),
					x: reader.readShort(),
					y: reader.readShort(),
					z: reader.readShort(),
					yaw: reader.readByte(),
					pitch: reader.readByte(),
				});
				break;
			case packetIds.Position:
				this.Position._emit({
					player: reader.readByte(),
					x: reader.readShort(),
					y: reader.readShort(),
					z: reader.readShort(),
				});
				break;
			case packetIds.Orientation:
				this.Orientation._emit({
					player: reader.readByte(),
					yaw: reader.readByte(),
					pitch: reader.readByte(),
				});
				break;
			case packetIds.DespawnPlayer:
				this.DespawnPlayer._emit({
					player: reader.readSByte(),
				});
				break;
			case packetIds.Message:
				this.Message._emit({
					player: reader.readByte(),
					message: reader.readString(),
				});
				break;
			case packetIds.Disconnect:
				this.Disconnect._emit({
					reason: reader.readString(),
				});
				break;
			case packetIds.UserType:
				this.UserType._emit({
					type: reader.readByte(),
				});
				break;
			default:
				this.Unknown._emit(buffer);
		}

		const lenght = packetIdsToLenght[buffer[0]] ?? 4096;
		if (buffer.length > lenght) {
			this._decode(buffer.slice(lenght, buffer.length));
		}
	}

	encodeServerIdentification(i: ServerIdentification): Uint8Array {
		const packet = new PacketWriter(packetLenght.ServerIdentification);
		packet.writeByte(packetIds.ServerIdentification);
		packet.writeByte(i.protocol);
		packet.writeString(i.name);
		packet.writeString(i.motd);
		packet.writeByte(i.userType);

		return packet.buffer;
	}

	encodePing(): Uint8Array {
		const packet = new PacketWriter(packetLenght.Ping);
		packet.writeByte(packetIds.Ping);

		return packet.buffer;
	}

	encodeLevelInitialize(): Uint8Array {
		const packet = new PacketWriter(packetLenght.LevelInitialize);
		packet.writeByte(packetIds.LevelInitialize);

		return packet.buffer;
	}

	encodeLevelData(i: LevelData): Uint8Array {
		const packet = new PacketWriter(packetLenght.LevelData);
		packet.writeByte(packetIds.LevelData);
		packet.writeShort(i.chunkLenght);
		packet.writeByteArray(i.chunkData);
		packet.writeByte(i.complite);

		return packet.buffer;
	}

	encodeLevelFinalize(i: LevelFinalize): Uint8Array {
		const packet = new PacketWriter(packetLenght.LevelFinalize);
		packet.writeByte(packetIds.LevelFinalize);
		packet.writeShort(i.x);
		packet.writeShort(i.y);
		packet.writeShort(i.z);

		return packet.buffer;
	}

	encodeSetBlock(i: SetBlock): Uint8Array {
		const packet = new PacketWriter(packetLenght.SetBlock);
		packet.writeByte(packetIds.SetBlock);
		packet.writeShort(i.x);
		packet.writeShort(i.y);
		packet.writeShort(i.z);
		packet.writeByte(i.block);

		return packet.buffer;
	}

	encodeSpawnPlayer(i: SpawnPlayer): Uint8Array {
		const packet = new PacketWriter(packetLenght.SpawnPlayer);
		packet.writeByte(packetIds.SpawnPlayer);
		packet.writeSByte(i.player);
		packet.writeString(i.name);
		packet.writeShort(i.x);
		packet.writeShort(i.y);
		packet.writeShort(i.z);
		packet.writeByte(i.yaw);
		packet.writeByte(i.pitch);

		return packet.buffer;
	}

	encodeTeleport(i: Teleport): Uint8Array {
		const packet = new PacketWriter(packetLenght.Teleport);
		packet.writeByte(packetIds.Teleport);
		packet.writeSByte(i.player);
		packet.writeShort(i.x);
		packet.writeShort(i.y);
		packet.writeShort(i.z);
		packet.writeByte(i.yaw);
		packet.writeByte(i.pitch);

		return packet.buffer;
	}

	encodePositionAndOrientation(i: PositionAndOrientation): Uint8Array {
		const packet = new PacketWriter(packetLenght.PositionAndOrientation);
		packet.writeByte(packetIds.PositionAndOrientation);
		packet.writeSByte(i.player);
		packet.writeSByte(i.x);
		packet.writeSByte(i.y);
		packet.writeSByte(i.z);
		packet.writeByte(i.yaw);
		packet.writeByte(i.pitch);

		return packet.buffer;
	}

	encodePosition(i: Position): Uint8Array {
		const packet = new PacketWriter(packetLenght.Position);
		packet.writeByte(packetIds.Position);
		packet.writeSByte(i.player);
		packet.writeSByte(i.x);
		packet.writeSByte(i.y);
		packet.writeSByte(i.z);

		return packet.buffer;
	}

	encodeOrientation(i: Orientation): Uint8Array {
		const packet = new PacketWriter(packetLenght.Orientation);
		packet.writeByte(packetIds.Orientation);
		packet.writeSByte(i.player);
		packet.writeByte(i.yaw);
		packet.writeByte(i.pitch);

		return packet.buffer;
	}

	encodeDespawnPlayer(i: DespawnPlayer): Uint8Array {
		const packet = new PacketWriter(packetLenght.DespawnPlayer);
		packet.writeByte(packetIds.DespawnPlayer);
		packet.writeSByte(i.player);

		return packet.buffer;
	}

	encodeMessage(i: Message): Uint8Array {
		const packet = new PacketWriter(packetLenght.Message);
		packet.writeByte(packetIds.Message);
		packet.writeSByte(i.player);
		packet.writeString(i.message);

		return packet.buffer;
	}

	encodeDisconnect(i: Disconnect): Uint8Array {
		const packet = new PacketWriter(packetLenght.Disconnect);
		packet.writeByte(packetIds.Disconnect);
		packet.writeString(i.reason);

		return packet.buffer;
	}

	encodeUserType(i: UserType): Uint8Array {
		const packet = new PacketWriter(packetLenght.UserType);
		packet.writeByte(packetIds.UserType);
		packet.writeByte(i.type);

		return packet.buffer;
	}
}

export const packetIds = {
	ServerIdentification: 0x00,
	Ping: 0x01,
	LevelInitialize: 0x02,
	LevelData: 0x03,
	LevelFinalize: 0x04,
	SetBlock: 0x06,
	SpawnPlayer: 0x07,
	Teleport: 0x08,
	PositionAndOrientation: 0x09,
	Position: 0x0a,
	Orientation: 0x0b,
	DespawnPlayer: 0x0c,
	Message: 0x0d,
	Disconnect: 0x0e,
	UserType: 0x0f,
};

export const packetLenght = {
	ServerIdentification: 131,
	Ping: 1,
	LevelInitialize: 1,
	LevelData: 1028,
	LevelFinalize: 7,
	SetBlock: 8,
	SpawnPlayer: 74,
	Teleport: 10,
	PositionAndOrientation: 10,
	Position: 8,
	Orientation: 4,
	DespawnPlayer: 2,
	Message: 66,
	Disconnect: 65,
	UserType: 2,
};

const packetIdsToLenght: Record<number, number> = {};

for (const x in packetIds) {
	packetIdsToLenght[(<Holder<number>>packetIds)[x]] = (<Holder<number>>packetLenght)[x];
}

export interface ServerIdentification {
	protocol: number;
	name: string;
	motd: string;
	userType: number;
}

export interface LevelData {
	chunkLenght: number;
	chunkData: Uint8Array;
	complite: number;
}

export interface LevelFinalize {
	x: number;
	y: number;
	z: number;
}

export interface SetBlock {
	x: number;
	y: number;
	z: number;
	block: number;
}

export interface SpawnPlayer {
	player: number;
	name: string;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
}

export interface Teleport {
	player: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
}

export interface PositionAndOrientation {
	player: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
}

export interface Position {
	player: number;
	x: number;
	y: number;
	z: number;
}

export interface Orientation {
	player: number;
	yaw: number;
	pitch: number;
}

export interface DespawnPlayer {
	player: number;
}

export interface Message {
	player: number;
	message: string;
}

export interface Disconnect {
	reason: string;
}

export interface UserType {
	type: number;
}
