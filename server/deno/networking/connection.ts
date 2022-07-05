import { ConnectionHandler, WrappedConnectionHandler } from '../../core/networking/connection.ts';
import { Server } from '../../core/server.ts';
import { PacketReader, PacketWriter } from './minecraft/packet.ts';
import { Nullable } from "../../core/types.ts";
import { ClassicConnectionHandler } from "../../core/networking/classic/connection.ts";
import { packetIdsToLenght } from "../../core/networking/classic/clientPackets.ts";
import { MCProtocolHandler } from "./minecraft/handler.ts";

let idBase = 0;

export class TpcConnectionHandler extends WrappedConnectionHandler {
	_conn: Nullable<Deno.Conn>;
	protected _buffer: Uint8Array;
	private _server: Server;
	public _handler: Nullable<ConnectionHandler> = null;
	private _classicHandler: Nullable<ClassicConnectionHandler> = null;
	private _modernHandler: Nullable<MCProtocolHandler> = null;

	private id = idBase++;

	constructor(conn: Deno.Conn, server: Server) {
		super();
		this._server = server;
		this._conn = conn;

		(this._conn as Deno.TcpConn).setKeepAlive();

		(this._conn as Deno.TcpConn).setNoDelay()
		this._buffer = new Uint8Array(1024 * 1024 * 10);
		this.loop(conn);
	}

	getHandler(): Nullable<ConnectionHandler> {
		return this._handler;
	}

	protected async loop(conn: Deno.Conn): Promise<void> {
		try {
			for (;;) {
				const chunks = await this.read(conn);
				if (chunks === null) break;

				if (this._classicHandler) {
					this._classicHandler._clientPackets._decode(chunks);
				} else if (this._modernHandler) {
					this._modernHandler._decode(chunks);
				} else {
					this.decodeFirstPacket(chunks);
				}
			}
		} catch (e) {
			this.handleError(e);
		}

		this.close();
	}

	protected decodeFirstPacket(c: Uint8Array) {
		if (this._conn == null) {
			return;
		}

		if (c[0] == 0x00 && c.length == packetIdsToLenght[0x00]) {
			this._classicHandler = new ClassicConnectionHandler(this._server, (<Deno.NetAddr>this._conn.remoteAddr).hostname, (<Deno.NetAddr>this._conn.remoteAddr).port, (d) => this._send(d));
			this._handler = this._classicHandler;
			this._classicHandler._clientPackets._decode(c);
			this._server.logger.conn(`Connection from ${this.getIp()}:${this.getPort()} with ${this.getClient()}`);
			return;
		}	

		if (this._server.config.enableModernMCProtocol) {
			try {
				const data = new PacketReader(c);
				data.readVarInt(); // lenght
				const id = data.readVarInt();

				if (id == 0 && c.length > 1) {
					this._modernHandler = new MCProtocolHandler(this._server, data.readVarInt(), data.readString(), data.readUShort(), data.readVarInt(), 
					(d) => this._send(d),
					(h, a) => {
						this._handler = h;
						this._server.addPlayer(a, this);
					},
					(e) => {
						if (e) {
							this.handleError(e)
						}

						this.close()
					});

					if (data.buffer.length > data.pos) {
						this._modernHandler._decode(c.slice(data.pos, data.buffer.length));
					}
				}
			} catch (e) {
				this.handleError(e);
			}
		}
	}

	async _send(packet: Uint8Array) {
		try {
			await this._conn?.write(packet);	

		} catch (e) {
			this.handleError(e);
		}
	}

	protected async read(conn: Deno.Conn): Promise<Uint8Array | null> {
		try {
			const read = await conn.read(this._buffer);

			if (read == null) {
				return null;
			} 

			const out = this._buffer.slice(0, read);
			return out;
		} catch (_error) {
			return null;
		}
	}

	protected close(triggerDisconnect = true): void {
		if (this._conn == null) {
			return;
		}
		try {
			this._conn?.close();
		} catch (_e) {
			// no-op
		} finally {
			this._conn = null;
			if (triggerDisconnect) {
				this.disconnect('');
			}
		}
	}

	getIp() {
		return (<Deno.NetAddr>this?._conn?.remoteAddr)?.hostname ?? "UNDEFINED";
	}

	getPort() {
		return (<Deno.NetAddr>this?._conn?.remoteAddr)?.port ?? 0
	}

	protected handleError(e: unknown, triggerDisconnect = true) {
		this._server.logger.conn(`Error occured with connection ${this.getIp()}:${this.getPort()} (${this._handler?.getPlayer()?.uuid ?? 'unknown'})!`);
		if (e instanceof Error) {
			this._server.logger.conn(e.name + ' - ' + e.message);

			if (e.stack) {
				this._server.logger.conn(e.stack);
			}

		}

		if (triggerDisconnect) {
			this.disconnect(`${e}`);
		}
	}
}