import { uuid } from '../../core/deps.ts';
import { ConnectionHandler } from '../../core/networking/connection.ts';
import { Server } from '../../core/server.ts';
import { AuthData, Nullable } from '../../core/types.ts';
import { wss, voxelsrv } from '../deps.ts';
import { IAuthRequest, IData } from './voxelsrv/proxy-client.ts';
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
		await this._conn?.write(packet);
	}

	protected async loop(conn: Deno.Conn): Promise<void> {
		for (;;) {
			const chunks = await this.read(conn);
			if (chunks === null) break;

			if (this._isClassic) {
				this._clientPackets._decode(chunks);
			} else {
				this.checkIfClassic(chunks);
			}
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

	protected close(): void {
		if (this._conn === null) {
			return;
		}

		try {
			this._conn?.close();
		} finally {
			this._conn = null;
			this.disconnect('');
		}
	}
}

export class VoxelSrvConnectionHandler extends ConnectionHandler {
	_conn: Nullable<wss.WebSocket> = null;
	_isLogged = false;
	_loggedData: Nullable<AuthData> = null;

	_secret: string;
	_secret2: string;

	_connect: Nullable<(overrides: Nullable<AuthData>) => void> = null;

	_checkLogin = false;
	_motd = '';
	_ignoredFirstMessage = false;

	constructor(conn: wss.WebSocket, server: Server) {
		super(server, (<Deno.NetAddr>conn.conn.remoteAddr).hostname, (<Deno.NetAddr>conn.conn.remoteAddr).port);
		this._conn = conn;
		this.loop(conn);
		this.isConnected = true;
		this._secret = uuid.v4() + uuid.v4() + uuid.v4();
		this._secret2 = uuid.v4() + uuid.v4() + uuid.v4();
	}

	async _authenticate(server: Server) {
		if (server.config.VoxelSrvOnlineMode) {
			await fetch('https://voxelsrv.pb4.eu/api/registerAuth', {
				method: 'POST',
				body: JSON.stringify({ token: this._secret, secret: this._secret2 }),
				headers: { 'Content-Type': 'application/json' },
			});

			this._checkLogin = true;
		}

		this._motd = server.config.serverMotd;

		await this._conn?.send(
			new Uint8Array(
				<ArrayBuffer>voxelsrv.parseToMessage('proxy-server', 'ProxyInfo', {
					name: server.config.serverName,
					proxyProtocol: voxelsrv.proxyVersion,
					onlinePlayers: Object.keys(server.players).length,
					maxPlayers: server.config.maxPlayerCount,
					motd: server.config.serverMotd,
					software: server.softwareName,
					auth: server.config.VoxelSrvOnlineMode,
					secret: this._secret,
					isProxy: true,
				})
			)
		);
	}

	protected async loop(sock: wss.WebSocket) {
		try {
			for await (const ev of sock) {
				if (ev instanceof Uint8Array) {
					const decoded = <{ data: unknown; type: string }>voxelsrv.parseToObject('proxy-client', ev);
					switch (decoded.type) {
						case 'AuthRequest':
							{
								if (this._checkLogin) {
									const parsed = <IAuthRequest>decoded.data;

									const checkLogin: { valid: boolean; uuid: string; username: string; type: number } = await (
										await fetch('https://voxelsrv.pb4.eu/api/validateAuth', {
											method: 'POST',
											body: JSON.stringify({ uuid: parsed.uuid, token: parsed.secret, secret: this._secret, serverSecret: this._secret2 }),
											headers: { 'Content-Type': 'application/json' },
										})
									).json();

									if (checkLogin.valid) {
										this._loggedData = {
											username: checkLogin.username,
											uuid: checkLogin.uuid,
											service: 'VoxelSrv',
											secret: null,
											authenticated: true,
											subService: null,
										};
									}
								}

								this._conn?.send(
									new Uint8Array(
										<ArrayBuffer>voxelsrv.parseToMessage('proxy-server', 'AuthResponce', {
											responce: 1,
											message: this._motd,
											proxyVersion: voxelsrv.proxyVersion,
											proxyVersionRev: 0,
											protocol: 7,
											usePacketTranslation: true,
											type: 'mc0.30c',
										})
									)
								);
							}
							break;
						case 'Ready':
							this._connect?.(this._loggedData);
							break;
						case 'Data':
							{
								const x = (<IData>decoded.data).message;

								if (x) {
									if (!this._ignoredFirstMessage && x[0] == this._clientPackets.packetIds.Message) {
										this._ignoredFirstMessage = true;
										continue;
									}

									this._clientPackets._decode(x);
								}
							}
							break;
						case 'VoxelSrvMessage':
							break;
						case 'ProxyMessage':
							break;
					}
				} else if (wss.isWebSocketCloseEvent(ev)) {
					const { reason } = ev;
					this.close(reason);
				}
			}
		} catch (err) {
			this._server?.logger.conn(`Error occured with connection ${this.ip}: ${err}` )
			if (!sock.isClosed) {
				this.close();
			}
		}
	}

	async _send(packet: Uint8Array) {
		await this._conn?.send(
			new Uint8Array(
				<ArrayBuffer>voxelsrv.parseToMessage('proxy-server', 'Data', {
					message: packet,
				})
			)
		);
	}

	protected close(reason = 'Connection closed!'): void {
		if (this._conn === null) {
			return;
		}

		try {
			if (!this._conn.isClosed) {
				this._conn?.close();
			}
		} finally {
			this._conn = null;
			this.disconnect(reason);
		}
	}
}
