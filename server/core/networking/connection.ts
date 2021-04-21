import { World } from '../world/world.ts';
import { ClientPacketHandler } from './classic/clientPackets.ts';
import { ServerPacketHandler } from './classic/serverPackets.ts';
import { gzip } from '../deps.ts';
import { Nullable, XYZ } from '../types.ts';
import { Player } from '../player.ts';
import { Server } from '../server.ts';
import { protocol6BlockMap } from './blockMaps.ts';

export const serverPackets = new ServerPacketHandler();

export class ConnectionHandler {
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

	constructor(server: Server, ip: string, port: number) {
		this._clientPackets = new ClientPacketHandler();
		this._server = server;
		this.ip = ip;
		this.port = port;
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
					player._action_block_break(value.x, value.y, value.z, value.block);
				} else {
					player._action_block_place(value.x, value.y, value.z, value.block);
				}
			});
		}
	}

	_send(_packet: Uint8Array) {
		console.log(_packet);
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
			this.sendingWorld = true;
			await this._send(serverPackets.encodeLevelInitialize());

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

			this._player ? this.sendSpawnPlayer(this._player) : null;
			await wait(10);
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
			if (text.length > 64) {
				let temp = text.substr(63, text.length - 63);

				this._send(serverPackets.encodeMessage({ player: pid, message: text.substr(0, 62) }));

				while (temp.length != 0) {
					this._send(serverPackets.encodeMessage({ player: pid, message: temp.substr(0, 62) }));

					temp = temp.substr(63, text.length - 63);
				}
			} else {
				this._send(serverPackets.encodeMessage({ player: pid, message: text }));
			}
		} catch (e) {
			this.handleError(e);
		}
	}

	disconnect(message: string) {
		if (this._player?.isConnected) {
			this._player?.disconnect();
			return;
		}

		if (this.isConnected) {
			if (this._player) {
				this._server?.logger.conn(`User ${this.ip}:${this.port} (${this._player.username}) disconnected! Reason ${message}`);
			}
			this.isConnected = false;
			try {
				this._send(serverPackets.encodeDisconnect({ reason: message }));
			} catch (e) {
				this.handleError(e, false);
			}
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
