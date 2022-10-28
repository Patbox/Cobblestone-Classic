import { ConnectionHandler } from "../../../core/networking/connection.ts";
import { Player } from "../../../core/player.ts";
import { Server } from "../../../core/server.ts";
import { AuthData, Nullable, XYZ } from "../../../core/types.ts";
import { zlib } from "../../deps.ts";
import { DenoServer } from "../../server.ts";
import { loginPackets } from "./loginPackets.ts";
import { getVarIntSize, PacketReader, PacketWriter } from "./packet.ts";
import { ModernConnectionHandler, playPackets } from "./playPackets.ts";

const protocolDebug = false;

enum NetworkingStage {
	STATUS,
	LOGIN,
	PLAY
}

export type PacketHandler = (handler: MCProtocolHandler, data: PacketReader) => void;

export class MCProtocolHandler {
	readonly selfUuid = "00000001-0000-0000-0000-000000000000";
	private _send: (d: Uint8Array) => Promise<void>;

	stage: NetworkingStage = NetworkingStage.STATUS;
	packets: PacketHandler[];

	compression = Number.MAX_SAFE_INTEGER;
	readonly protocol: number;
	readonly _server: Server;
	close: (reason?: string|Error) => void;
	authData: Nullable<AuthData> = null;
	connect: (handler: ConnectionHandler, auth: AuthData) => void;
	player: Nullable<Player> = null;
	data = {
		minePos: null as Nullable<XYZ>,
		mineTime: null as Nullable<number>,
		lastSequence: -1
	}
	inventory: number[] = Array(50);
	inventorySlot = 0;

	constructor(server: Server, protocol: number, _serverHostname: string, _serverPort: number, nextStatus: number, send: (d: Uint8Array) => Promise<void>, connect: (handler: ConnectionHandler, auth: AuthData) => void, close: (reason?: string|Error) => void) {
		this._send = send;
		this.stage = nextStatus == 1 ? NetworkingStage.STATUS : NetworkingStage.LOGIN;
		this.packets = this.stage == NetworkingStage.STATUS ? statusPackets : loginPackets;
		this.protocol = protocol;
		this._server = server;
		this.connect = connect;
		this.close = close;
	}

	send(packet: PacketWriter) {
		return this._send(packet.toPacket(packet.pos >= this.compression))
	}


	_decode(data: Uint8Array) {
		try {
			const reader = new PacketReader(data);

			while(!reader.atEnd()) {
				const lenght = reader.readVarInt();

				if (lenght >= this.compression) {
					const lenght2 = reader.readVarInt();

					const packet = new PacketReader(zlib.inflate(reader.readByteArray(lenght - getVarIntSize(lenght2))));
					this.decode(packet.readVarInt(), packet);
				} else {
					const packet = new PacketReader(reader.readByteArray(lenght));
					this.decode(packet.readVarInt(), packet);
				}
			}	
		} catch (_e) {
			this.close(_e);
		}	
	}

	decode(packetId: number, reader: PacketReader) {
		const packet = this.packets[packetId];
		if (packet) {
			packet(this, reader);
		} else if (protocolDebug) {
			this._server.logger.debug(`Unhandled packet id ${packetId} for stage ${this.stage}`)
		}
	}

	switchToPlay() {
		if (this.authData) {
			this.stage = NetworkingStage.PLAY;
			this.packets = playPackets;
			this.connect(new ModernConnectionHandler(this, this._server, "", 0), this.authData);
		}
	}
}

const statusPackets: PacketHandler[] = [];

statusPackets[0x00] = (handler, _data) => {
	handler.send(new PacketWriter()
		.writeVarInt(0x00)
		.writeString(
			JSON.stringify({
				version: {
					name: '0.30',
					protocol: 0,
				},
				description: {
					text: `${handler._server.config.serverName.replaceAll('&', '§')}\n${handler._server.config.serverMotd.replaceAll('&', '§')}`,
				},
				favicon: (<DenoServer>handler._server)._serverIcon ? 'data:image/png;base64,' + (<DenoServer>handler._server)._serverIcon : undefined,
			})
		)
	);
}

statusPackets[0x01] = (handler, data) => {
	handler.send(new PacketWriter(16).writeVarInt(0x01).writeLong(data.readLong()));
	handler.close()
}