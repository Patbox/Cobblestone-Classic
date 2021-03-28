import { uuid } from '../../core/deps.ts';
import { ConnectionHandler } from '../../core/networking/connection.ts';
import { Server } from '../../core/server.ts';
import { AuthData, Nullable } from '../../core/types.ts';
import { wss, voxelsrv } from '../deps.ts';
import { IAuthRequest, IData } from './voxelsrv/proxy-client.ts';

export class TpcConnectionHandler extends ConnectionHandler {
	_conn: Deno.Conn | null = null;
	_buffer: Uint8Array;

	constructor(conn: Deno.Conn) {
		super((<Deno.NetAddr>conn.remoteAddr).hostname, (<Deno.NetAddr>conn.remoteAddr).port);

		this._conn = conn;
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

			this._clientPackets._decode(chunks);
		}

		this.close();
	}

	protected async read(conn: Deno.Conn): Promise<Uint8Array | null> {
		let read: number | null;

		try {
			read = await conn.read(this._buffer);
			if (read === null) return null;
		} catch (error) {
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
			this._conn.close();
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

	constructor(conn: wss.WebSocket) {
		super((<Deno.NetAddr>conn.conn.remoteAddr).hostname, (<Deno.NetAddr>conn.conn.remoteAddr).port);
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
					onlinePlayers: 0,
					maxPlayers: 0,
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
