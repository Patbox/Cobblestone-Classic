import { ConnectionHandler, WrappedConnectionHandler } from '../../core/networking/connection.ts';
import { Server } from '../../core/server.ts';
import { PacketReader, PacketWriter } from './minecraft/packet.ts';
import { Nullable } from '../../core/types.ts';
import { ClassicConnectionHandler } from '../../core/networking/classic/connection.ts';
import { packetIdsToLenght } from '../../core/networking/classic/clientPackets.ts';
import { MCProtocolHandler } from './minecraft/handler.ts';
import { Base64 } from '../../core/deps.ts';
import { DenoServer } from '../server.ts';

const decoder = new TextDecoder();
const encoder = new TextEncoder();

let idBase = 0;

export class TpcConnectionHandler extends WrappedConnectionHandler {
	_conn: Nullable<Deno.Conn>;
	protected _buffer: Uint8Array;
	private _server: DenoServer;
	public _handler: Nullable<ConnectionHandler> = null;

	private _clientDataConsumer: (data: Uint8Array) => void = (data) => this.decodeFirstPacket(data);
	private _clientDataWriter: (data: Uint8Array) => Promise<unknown> = async (data) => await this._conn?.write(data);

	private _webSocketHandler: Nullable<WebSocketHandler> = null;

	private id = idBase++;

	constructor(conn: Deno.Conn, server: DenoServer) {
		super();
		this._server = server;
		this._conn = conn;

		(this._conn as Deno.TcpConn).setKeepAlive();

		(this._conn as Deno.TcpConn).setNoDelay();
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

				this._clientDataConsumer(chunks);
			}
		} catch (e) {
			this.handleError(e);
		}

		this.close();
	}

	protected async decodeFirstPacket(c: Uint8Array) {
		if (this._conn == null) {
			return;
		}
		if (c[0] == 0x00 && c.length == packetIdsToLenght[0x00]) {
			const handler = new ClassicConnectionHandler(
				this._server,
				(<Deno.NetAddr>this._conn.remoteAddr).hostname,
				(<Deno.NetAddr>this._conn.remoteAddr).port,
				(d) => this._send(d)
			);
			this._handler = handler;
			handler._clientPackets._decode(c);
			if (this._webSocketHandler) {
				this._webSocketHandler.setConsumer((x) => handler._clientPackets._decode(x));
			} else {
				this._clientDataConsumer = (x) => handler._clientPackets._decode(x);
			}
			this._server.logger.conn(`Connection from ${this.getIp()}:${this.getPort()} with ${this.getClient()}`);
			return;
		}
		if (this._server.config.enableModernMCProtocol) {
			try {
				const data = new PacketReader(c);
				data.readVarInt(); // lenght
				const id = data.readVarInt();

				if (id == 0 && c.length > 1) {
					const handler = new MCProtocolHandler(
						this._server,
						data.readVarInt(),
						data.readString(),
						data.readUShort(),
						data.readVarInt(),
						(d) => this._send(d),
						(h, a) => {
							this._handler = h;
							this._server.addPlayer(a, this);
						},
						(e) => {
							if (e) {
								this.handleError(e);
							}

							this.close();
						}
					);

					if (this._webSocketHandler) {
						this._webSocketHandler.setConsumer((x) => handler._decode(x));
					} else {
						this._clientDataConsumer = (data) => handler._decode(data);
					}

					if (data.buffer.length > data.pos) {
						handler._decode(c.slice(data.pos, data.buffer.length));
					}

					return;
				}
			} catch (_e) {
				// noop
			}
		}

		if (!this._webSocketHandler) {
			try {
				const lines = decoder.decode(this._buffer);
				if (lines.includes('HTTP')) {
					let isWebsocket = false;
					let webSocketKey;
					let webSocketProtocols;
					for (const line of lines.split('\r\n')) {
						const [key, value] = line.split(': ', 2);

						if (key.toLocaleLowerCase() == 'upgrade') {
							if (value.includes('websocket')) {
								isWebsocket = true;
							}
						} else if (key.toLocaleLowerCase() == 'sec-websocket-key') {
							webSocketKey = value;
						} else if (key.toLocaleLowerCase() == 'sec-websocket-protocol') {
							webSocketProtocols = value;
						}
					}

					if (isWebsocket) {
						let proto = '';
						if (webSocketProtocols == 'ClassiCube') {
							proto = 'ClassiCube';
						}

						const res =
							'HTTP/1.1 101 Switching Protocols\r\n' +
							`Server: ${Server.softwareId}/${Server.softwareVersion} on Deno\r\n` +
							'Connection: upgrade\r\n' +
							'Upgrade: websocket\r\n' +
							'Access-Control-Allow-Origin: *\r\n' +
							'Sec-WebSocket-Version: 13\r\n' +
							(proto ? `Sec-WebSocket-Protocol: ${proto}\r\n` : '') +
							`Sec-WebSocket-Accept: ${Base64.encode(
								await crypto.subtle.digest('SHA-1', encoder.encode(webSocketKey + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11'))
							)}\r\n\r\n`;


						const handler = new WebSocketHandler(this._clientDataWriter, this._clientDataConsumer);
						this._webSocketHandler = handler;
						this._clientDataConsumer = (data) => handler.onReceived(data);
						this._clientDataWriter = (data) => handler.onWritten(data);
						await this._conn.write(encoder.encode(res));

						return;
					} else {
						let out = '';

						if (this._server._serverIcon) {
							out += `<center><img width="128" height="128" style="image-rendering: pixelated;" src="data:image/png;base64, ${this._server._serverIcon}"></center>`;
						}

						out += `<center><h1>${this._server.config.serverName}</h1></center>`;
						out += `<center><h2>${this._server.config.serverMotd}</h2></center>`;
						out += `<center><h3>Server Address: ${this._server.config.address}:${this._server.config.port}</h3></center>`;
						out += `Connect using compatible client!\n`;
						out += `Currently supported: <ul>`;
						out += `<li>Minecraft Classic 0.30 (protocol 7/compatible)</li>`;

						if (this._server.config.enableModernMCProtocol) {
							out += `<li>Minecraft 1.19.2</li>`;
						}

						if (this._server.config.useClassiCubeHeartbeat) {
							out += `<li>ClassiCube`;
							if (this._server._classiCubeWebAddress) {
								out += ` (<a href="${this._server._classiCubeWebAddress}">Play in Browser)`;
							}
							out += `</li>`;
						}

						out += '</ul>';

						const res =
							'HTTP/1.1 200 Ok\r\n' +
							`Server: ${Server.softwareId}/${Server.softwareVersion} on Deno\r\n` +
							'Connection: close\r\n' +
							`Date: ${new Date().toUTCString()}\r\n` +
							'Content-Language: en-US\r\n' +
							`Content-Length: ${out.length}\r\n` +
							'Content-Type: text/html; charset=utf-8\r\n\r\n' +
							out;

						await this._conn.write(encoder.encode(res));
						this.close();
						return;
					}
				}
			} catch (_e) {
				//noop
			}
		}

		//this.close();
		//this.handleError('Unknown protocol!');
	}

	async _send(packet: Uint8Array) {
		try {
			await this._clientDataWriter(packet);
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
		return (<Deno.NetAddr>this?._conn?.remoteAddr)?.hostname ?? 'UNDEFINED';
	}

	getPort() {
		return (<Deno.NetAddr>this?._conn?.remoteAddr)?.port ?? 0;
	}

	protected handleError(e: unknown, triggerDisconnect = true) {
		this._server.logger.conn(
			`Error occured with connection ${this.getIp()}:${this.getPort()} (${this._handler?.getPlayer()?.uuid ?? 'unknown player'})!`
		);
		if (e instanceof Error) {
			this._server.logger.conn(e.name + ' - ' + e.message);

			if (e.stack) {
				this._server.logger.conn(e.stack);
			}
		} else {
			this._server.logger.conn(e + '');
		}

		if (triggerDisconnect) {
			this.disconnect(`${e}`);
			try {
				this._conn?.close();
			} catch (_e) {
				// noop
			}
		}
	}
}

class WebSocketHandler {
	private consumer: (x: Uint8Array) => void = () => {};
	private writer: (data: Uint8Array) => Promise<unknown>;

	private buffer: Uint8Array = new Uint8Array(1024 * 1024 * 10);
	private currentPos = 0;

	constructor(writer: (data: Uint8Array) => Promise<unknown>, consumer: (x: Uint8Array) => void) {
		this.writer = writer;
		this.consumer = consumer;
	}

	onReceived(data: Uint8Array): void {
		const fin = (data[0] & 0b10000000) != 0;
		const opcode = data[0] & 0b00001111;
		const mask = (data[1] & 0b10000000) != 0;

		let lenght = data[1] & 0b01111111;
		let offset = 2;

		if (lenght == 126) {
			lenght = (data[2] << 8) | data[3];
			offset = 4;
		} else if (lenght == 127) {
			lenght =
				(((((((((((((data[2] << 8) | data[3]) << 8) | data[4]) << 8) | data[5]) << 8) | data[6]) << 8) | data[7]) << 8) | data[8]) << 8) | data[9];
			offset = 10;
		}

		let decoded = new Uint8Array(lenght);
		if (mask) {
			const masks = [data[offset], data[offset + 1], data[offset + 2], data[offset + 3]];
			offset += 4;

			for (let i = 0; i < lenght; ++i) {
				decoded[i] = data[offset + i] ^ masks[i % 4];
			}
		} else {
			for (let i = 0; i < lenght; ++i) {
				decoded[i] = data[offset + i];
			}
		}

		if (fin) {
			if (this.currentPos != 0) {
				this.addToBuffer(decoded);
				decoded = this.buffer;
			}

			this.currentPos = 0;

			if (opcode == 0x01) {
				this.writeData(0x01, encoder.encode('pong: ' + decoder.decode(decoded)))
			} else if (opcode == 0x02) {
				this.consumer(decoded);
			}
		} else {
			this.addToBuffer(decoded);
		}
	}

	private addToBuffer(decoded: Uint8Array) {
		if (this.currentPos + decoded.length < this.buffer.length) {
			const old = this.buffer;
			this.buffer = new Uint8Array(this.buffer.length * 2);
			this.buffer.set(old);
		}
		const currentPos = this.currentPos;
		this.currentPos += decoded.length;

		this.buffer.set(decoded, currentPos);
	}

	onWritten(data: Uint8Array): Promise<unknown> {
		return this.writeData(0x02, data);
	}

	writeData(opcode: number, data: Uint8Array): Promise<unknown> {
		const writer = new PacketWriter();
		writer.writeByte(0b10000000 | (opcode & 0b00001111));

		if (data.length < 126) {
			writer.writeByte(data.length);
		} else if (data.length < 2 ** 16) {
			writer.writeByte(126);
			writer.writeUShort(data.length);
		} else {
			writer.writeByte(127);
			writer.writeInt(0);
			writer.writeInt(data.length);
		}

		writer.writeByteArray(data);

		return this.writer(writer.toBuffer());
	}

	setConsumer(arg0: (x: Uint8Array) => void) {
		this.consumer = arg0;
	}
}
