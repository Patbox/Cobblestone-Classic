import { World } from '../../world/world.ts';
import { ClientPacketHandler } from './clientPackets.ts';
import { ServerPacketHandler } from './serverPackets.ts';
import { gzip } from '../../deps.ts';
import { AuthData, Nullable, XYZ } from '../../types.ts';
import { Player } from '../../player.ts';
import { Server } from '../../server.ts';
import { protocol6BlockMap } from './blockMaps.ts';
import { ConnectionHandler } from '../connection.ts';

export const serverPackets = new ServerPacketHandler();

export class ClassicConnectionHandler implements ConnectionHandler {
	readonly _clientPackets: ClientPacketHandler;
	readonly _serverPackets = serverPackets;
	_player: Nullable<Player> = null;
	_server: Server;

	isConnected = false;
	sendingWorld = false;
	lastSpawn: XYZ = [0, 0, 0];
	readonly ip: string;
	readonly port: number;
	_protocol = Server.targetProtocol;
	_blockRemap: number[] | null = null;

	blockUpdates: Uint8Array[] = [];
	client: string;
	private _overrides: AuthData | undefined;
	_send: (data: Uint8Array) => void;

	constructor(server: Server, ip: string, port: number, send: (data: Uint8Array) => void, overrides?: AuthData) {
		this._clientPackets = new ClientPacketHandler();
		this._server = server;
		this.ip = ip;
		this.port = port;
		this.client = 'Minecraft Classic';
		this._overrides = overrides;
		this._send = send;

		this._clientPackets.PlayerIdentification.once(async ({ value: playerInfo }) => {
			try {
				if (!this.setProtocol(playerInfo.protocol)) {
					this.disconnect('Unsupported protocol!');
					return;
				} else if (playerInfo.username.length > 32 || playerInfo.username.length < 3) {
					this.disconnect('Invalid nickname!');
					return;
				}

				this.sendServerInfo(server);

				const result = await server.authenticatePlayer({
					uuid: this._overrides?.uuid ?? playerInfo.username.toLowerCase(),
					username: this._overrides?.username ?? playerInfo.username,
					authProvider: this._overrides?.authProvider ?? 'None',
					service: this._overrides?.service ?? 'Minecraft',
					secret: this._overrides?.secret ?? playerInfo.key,
					authenticated: this._overrides?.authenticated ?? false,
				});

				if (result.allow) {
					server.addPlayer(result.auth, this);
				} else {
					this.disconnect('You need to log in!');
				}
			} catch (e) {
				server.logger.conn('Disconnected player - ' + e);
				this.disconnect(e);
			}
		});
	}

	tick() {}

	getPlayer(): Nullable<Player> {
		return this._player;
	}

	getPort(): number {
		return this.port;
	}

	getIp(): string {
		return this.ip;
	}

	getClient(): string {
		return this.client;
	}

	setPlayer(player: Player) {
		if (this._player == null) {
			this._player = player;

			this._clientPackets.Message.on(({ value }) => player._action_chat_message(value.message));
			this._clientPackets.Position.on(({ value }) =>
				player._action_move(fromCords(value.x), fromCords(value.y - 51), fromCords(value.z), value.yaw, value.pitch)
			);

			this._clientPackets.SetBlock.on(({ value }) => {
				if (value.mode == 0) {
					player._action_block_break(value.x, value.y, value.z);
				} else {
					player._action_block_place(value.x, value.y, value.z, value.block);
				}
			});
		}
	}

	setProtocol(protocol: number): boolean {
		this._protocol = protocol;

		if (protocol == Server.targetProtocol) {
			return true;
		} else if (protocol == 0x06) {
			this._blockRemap = protocol6BlockMap;
			return true;
		}
		return false;
	}

	sendServerInfo(server: Server) {
		this._server = server;
		try {
			this._send(
				serverPackets.encodeServerIdentification({
					name: this._server.config.serverName,
					motd: this._server.config.serverMotd,
					protocol: Server.targetProtocol,
					userType: 0,
				})
			);
		} catch (e) {
			this.handleError(e);
		}
	}

	async sendWorld(world: World) {
		try {
			if (!this._player) {
				throw "No player!"
			}

			this.sendingWorld = true;
			await this._send(serverPackets.encodeLevelInitialize());
			await this.sendTeleport(this._player, this._player.position, this._player.yaw, this._player.pitch);

			const blockData = new Uint8Array(world.blockData.length + 4);
			const view = new DataView(blockData.buffer, blockData.byteOffset, blockData.byteLength);
			view.setUint32(0, world.blockData.length);
			if (this._blockRemap) {
				for (let x = 4; x < blockData.length; x++) {
					blockData[x] = this._blockRemap[world.blockData[x - 4]];
				}
			} else {
				blockData.set(world.blockData, 4);
			}

			const compressedMap = gzip(blockData);

			if (compressedMap == undefined) {
				return;
			}

			for (let i = 0; i < compressedMap.length; i += 1024) {
				const x = compressedMap.slice(i, Math.min(i + 1024, compressedMap.length));
				const packet = serverPackets.encodeLevelData({
					chunkData: x,
					chunkLenght: x.length,
					complite: i == 0 ? 0 : Math.ceil((i / compressedMap.length) * 100),
				});

				await this._send(packet);
				await wait(5);
			}

			await this._send(serverPackets.encodeLevelFinalize({ x: world.size[0], y: world.size[1], z: world.size[2] }));
			await wait(5);

			this.sendingWorld = false;
			world.players.forEach((p) => this.sendSpawnPlayer(p));
			this.sendSpawnPlayer(this._player);
			await this.sendTeleport(this._player, this._player.position, this._player.yaw, this._player.pitch);
		} catch (e) {
			this.handleError(e);
		}
	}

	setBlock(x: number, y: number, z: number, block: number): void {
		if (this._blockRemap) {
			block = this._blockRemap[block];
		}

		const packet = serverPackets.encodeSetBlock({
			x,
			y,
			z,
			block,
		});

		if (this.sendingWorld) {
			this.blockUpdates.push(packet);
		} else {
			this._send(packet);
		}
	}

	sendMessage(player: Nullable<Player>, text: string) {
		try {
			const pid = player != null ? player.numId : 0;

			if (text[text.length - 1] == '&') {
				text[text.length - 1] == ' '
			}

			if (text.length > 64) {
				const a: [string, string][] = [];

				const lines = text.split('&');
				a.push([lines.shift() ?? '', '']);

				for (const line of lines) {
					if (line.length > 1) {
						const base = line.substring(1, line.length);
						a.push([base, '&' + line[0]]);
					}
				}

				let temp = '';
				while (a.length > 0) {
					const x = a.shift() ?? ['', ''];
					const lenght = temp.length + x[0].length + x[1].length;
					if (lenght < 64) {
						temp = temp + x[1] + x[0];
					} else {
						const val = (64 - (temp.length + 2));
						if (val > 0) {
							temp = temp + x[1] + x[0].substring(0, val);

							x[0] = x[0].substring(val, x[0].length);
						}

						this._send(serverPackets.encodeMessage({ player: pid, message: temp }));
						temp = '';
						a.unshift(x);
					}
				}

				if (temp.length > 0) {
					this._send(serverPackets.encodeMessage({ player: pid, message: temp }));
				}
			} else {
				this._send(serverPackets.encodeMessage({ player: pid, message: text }));
			}
		} catch (e) {
			this.handleError(e);
		}
	}

	disconnect(message: string) {
		try {
			if (this._player?.isConnected) {
				this._player?.disconnect();
				return;
			}

			if (this.isConnected) {
				if (this._player) {
					this._server?.logger.conn(`User ${this.ip}:${this.port} (${this._player.username}) disconnected! Reason ${message}`);
				}
				this.isConnected = false;
				this._send(serverPackets.encodeDisconnect({ reason: message }));
			}
		} catch (e) {
			this.handleError(e, false);
		}
	}

	sendTeleport(player: Player, pos: XYZ, yaw: number, pitch: number) {
		const pid = this._player == player ? -1 : player.numId;
		pid == -1 ? (this.lastSpawn = [...player.position]) : null;

		this._send(serverPackets.encodeTeleport({ player: pid, x: toCords(pos[0]), y: toCords(pos[1]) + 51, z: toCords(pos[2]), yaw, pitch }));
	}

	sendMove(player: Player, pos: XYZ, yaw: number, pitch: number) {
		if (this._player != player) {
			this._send(
				serverPackets.encodeTeleport({
					player: player.numId,
					x: toCords(pos[0]),
					y: toCords(pos[1]) + 51,
					z: toCords(pos[2]),
					yaw,
					pitch,
				})
			);
		}
	}

	sendSpawnPlayer(player: Player) {
		const pid = this._player == player ? -1 : player.numId;
		pid == -1 ? (this.lastSpawn = [...player.position]) : null;

		this._send(
			serverPackets.encodeSpawnPlayer({
				player: pid,
				name: player.username,
				x: toCords(player.position[0]),
				y: toCords(player.position[1]) + 51,
				z: toCords(player.position[2]),
				yaw: player.yaw,
				pitch: player.pitch,
			})
		);

		this.sendTeleport(player, player.position, player.yaw, player.pitch);
	}

	sendDespawnPlayer(player: Player) {
		const pid = this._player == player ? -1 : player.numId;

		this._send(
			serverPackets.encodeDespawnPlayer({
				player: pid,
			})
		);
	}

	protected handleError(e: unknown, triggerDisconnect = true) {
		this._server.logger.conn(`Error occured with connection ${this.ip}:${this.port} (${this._player?.uuid ?? 'unknown'})! ${e}`);
		if (triggerDisconnect) {
			this.disconnect(`${e}`);
		}
	}
}

function fromCords(n: number): number {
	return n / 32;
}

function toCords(n: number): number {
	return Math.floor(n * 32);
}

function wait(t: number) {
	return new Promise((res) => {
		setTimeout(() => res(null), t);
	});
}
