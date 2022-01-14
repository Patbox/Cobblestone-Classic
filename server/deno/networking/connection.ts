import { ConnectionHandler } from '../../core/networking/connection.ts';
import { Server } from '../../core/server.ts';
import { PacketWriter as MCPacketWriter, PacketReader as MCPacketReader } from './minecraft/packet.ts';
import { DenoServer } from '../server.ts';

export class TpcConnectionHandler extends ConnectionHandler {
	_conn: Deno.Conn | null = null;
	protected _buffer: Uint8Array;
	protected _callback: (s: ConnectionHandler) => void;
	protected _isClassic = false;

	constructor(conn: Deno.Conn, server: Server, callback: (s: ConnectionHandler) => void) {
		super(server, (<Deno.NetAddr>conn.remoteAddr).hostname, (<Deno.NetAddr>conn.remoteAddr).port);

		this._conn = conn;
		this._callback = callback;
		this._buffer = new Uint8Array(4096);
		this.loop(conn);
		this.isConnected = true;
	}

	async _send(packet: Uint8Array) {
		try {
			await this._conn?.write(packet);
		} catch (e) {
			this.handleError(e);
		}
	}

	protected async loop(conn: Deno.Conn): Promise<void> {
		try {
			for (;;) {
				const chunks = await this.read(conn);
				if (chunks === null) break;

				if (this._isClassic) {
					this._clientPackets._decode(chunks);
				} else {
					this.checkIfClassic(chunks);
				}
			}
		} catch (e) {
			this.handleError(e);
		}

		this.close();
	}

	protected checkIfClassic(c: Uint8Array) {
		if (c[0] == 0x00 && c.length == this._clientPackets.packetLenght[0x00]) {
			this._callback(this);
			this._isClassic = true;
			this._clientPackets._decode(c);
			return;
		}

		const data = new MCPacketReader(c);

		const id = data.readVarInt();
		if (id == 0 && c.length > 2) {
			data.readVarInt(); // Protocol
			data.readString(); // Address
			data.readUShort(); // Port

			const state = data.readVarInt();

			if (!this._conn) return;

			if (state == 1) {
				const data = new MCPacketWriter(0x00)
					.writeString(
						JSON.stringify({
							version: {
								name: 'Classic 0.30',
								protocol: 7,
							},
							description: {
								text: `${this._server.config.serverName.replaceAll('&', '§')}\n${this._server.config.serverMotd.replaceAll('&', '§')}`,
							},
							favicon: (<DenoServer>this._server)._serverIcon,
						})
					)
					.toPacket();
				this._conn.write(data);
			} else {
				this._conn.write(
					new MCPacketWriter(0x00)
						.writeString(
							JSON.stringify({
								text: `You need to use Minecraft Classic 0.30 (or compatible) client!`,
							})
						)
						.toPacket()
				);
			}
		} else if (id == 1) {
			const x = data.readLong();
			this._conn?.write(new MCPacketWriter(0x01, 4).writeLong(x).toPacket());
		}
	}

	protected async read(conn: Deno.Conn): Promise<Uint8Array | null> {
		let read: number | null;

		try {
			read = await conn.read(this._buffer);
			if (read === null) return null;
		} catch (_error) {
			return null;
		}

		const bytes = this._buffer.subarray(0, read);
		return bytes;
	}

	protected close(triggerDisconnect = true): void {
		if (this._conn === null) {
			return;
		}

		try {
			this._conn?.close();
		} finally {
			this._conn = null;
			if (triggerDisconnect) {
				this.disconnect('');
			}
		}
	}
}