import { World } from '../world.ts';
import { ClientPacketHandler } from './clientPackets.ts';
import { ServerPacketHandler, SetBlock } from './serverPackets.ts';
import { gzip } from '../deps.ts';
import { Nullable, XYZ } from '../types.ts';
import { Player } from '../player.ts';
import { Server } from '../server.ts';

export const serverPackets = new ServerPacketHandler();

export class ConnectionHandler {
	_clientPackets: ClientPacketHandler;
	_player: Nullable<Player> = null;

	isConnected = false;
	sendingWorld = false;

	blockUpdates: Uint8Array[] = [];

	constructor() {
		this._clientPackets = new ClientPacketHandler();
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

	async _send(packet: Uint8Array) {}

	sendServerInfo(server: Server) {
		this._send(
			serverPackets.encodeServerIdentification({
				name: server.config.serverName,
				motd: server.config.serverMotd,
				protocol: 7,
				userType: 0,
			})
		);
	}

	async sendWorld(world: World) {
		this.sendingWorld = true;
		await this._send(serverPackets.encodeLevelInitialize());

		const compressedMap = gzip(world.blockData);

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
		}

		await this._send(serverPackets.encodeLevelFinalize({ x: world.size[0], y: world.size[1], z: world.size[2] }));
		this.sendingWorld = false;
		world.players.forEach((p) => this.sendSpawnPlayer(p));
	}

	setBlock(x: number, y: number, z: number, block: number): void {
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
	}

	disconnect(message: string) {
		if (this._player?.isConnected) {
			this._player?.disconnect();
			return;
		}

		if (this.isConnected) {
			this.isConnected = false;
			this._send(serverPackets.encodeDisconnect({ reason: message }));
		}
	}

	sendTeleport(player: Player, pos: XYZ, yaw: number, pitch: number) {
		const pid = this._player == player ? -1 : player.numId;
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
	}

	sendDespawnPlayer(player: Player) {
		const pid = this._player == player ? -1 : player.numId;

		this._send(
			serverPackets.encodeDespawnPlayer({
				player: pid,
			})
		);
	}
}

function fromCords(n: number): number {
	return n / 32;
}

function toCords(n: number): number {
	return Math.floor(n * 32);
}
