import { Emitter } from '../../../libs/emitter.ts';
import { Holder } from "../../types.ts";
import { ClassicPacketReader, ClassicPacketWriter } from './packet.ts';

export class ClientPacketHandler {
	packetIds = packetIds;
	packetLenght = packetIdsToLenght;
	packetIdsToLenght = packetIdsToLenght

	PlayerIdentification = new Emitter<PlayerIdentification>();
	SetBlock = new Emitter<SetBlock>();
	Position = new Emitter<Position>();
	Message = new Emitter<Message>();

	Unknown = new Emitter<Uint8Array>();

	_decode(buffer: Uint8Array) {
		const reader = new ClassicPacketReader(buffer);

		while (!reader.isFinished()) {
			switch (reader.readByte()) {
				case packetIds.PlayerIdentification:
					this.PlayerIdentification._emit({
						protocol: reader.readByte(),
						username: reader.readString(),
						key: reader.readString(),
						modded: reader.readByte(),
					});
					break;
				case packetIds.SetBlock:
					this.SetBlock._emit({
						x: reader.readShort(),
						y: reader.readShort(),
						z: reader.readShort(),
						mode: reader.readByte(),
						block: reader.readByte(),
					});
					break;

				case packetIds.Position:
					this.Position._emit({
						player: reader.readByte(),
						x: reader.readShort(),
						y: reader.readShort(),
						z: reader.readShort(),
						yaw: reader.readByte(),
						pitch: reader.readByte(),
					});
					break;

				case packetIds.Message:
					this.Message._emit({
						unused: reader.readByte(),
						message: reader.readString(),
					});
					break;
				default:
					this.Unknown._emit(buffer);
			}
		}
	}

	encodePlayerIdentification(i: PlayerIdentification): Uint8Array {
		const packet = new ClassicPacketWriter(packetLenght.PlayerIdentification);
		packet.writeByte(packetIds.PlayerIdentification);
		packet.writeByte(i.protocol);
		packet.writeString(i.username);
		packet.writeString(i.key);
		packet.writeByte(i.modded);

		return packet.toPacket();
	}

	encodeSetBlock(i: SetBlock): Uint8Array {
		const packet = new ClassicPacketWriter(packetLenght.SetBlock);
		packet.writeByte(packetIds.SetBlock);
		packet.writeShort(i.x);
		packet.writeShort(i.y);
		packet.writeShort(i.z);
		packet.writeByte(i.mode);
		packet.writeByte(i.block);

		return packet.toPacket();
	}

	encodePosition(i: Position): Uint8Array {
		const packet = new ClassicPacketWriter(packetLenght.Position);
		packet.writeByte(packetIds.Position);
		packet.writeByte(0xFF);
		packet.writeShort(i.x);
		packet.writeShort(i.y);
		packet.writeShort(i.z);

		return packet.toPacket();
	}

	encodeMessage(i: Message): Uint8Array {
		const packet = new ClassicPacketWriter(packetLenght.Message);
		packet.writeByte(packetIds.Message);
		packet.writeByte(0xFF);
		packet.writeString(i.message);

		return packet.toPacket();
	}
}

export const packetIds = {
	PlayerIdentification: 0x00,
	SetBlock: 0x05,
	Position: 0x08,
	Message: 0x0d,
};

export const packetLenght = {
	PlayerIdentification: 131,
	SetBlock: 9,
	Position: 10,
	Message: 66,
};

const packetIdsToLenghtTmp: Record<number, number> = {};

for (const x in packetIds) {
	packetIdsToLenghtTmp[(<Holder<number>>packetIds)[x]] = (<Holder<number>>packetLenght)[x];
}

export const packetIdsToLenght = packetIdsToLenghtTmp;

export interface PlayerIdentification {
	protocol: number;
	username: string;
	key: string;
	modded: number;
}

export interface SetBlock {
	x: number;
	y: number;
	z: number;
	mode: number;
	block: number;
}

export interface Position {
	player: number;
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
}

export interface Message {
	unused: number;
	message: string;
}
