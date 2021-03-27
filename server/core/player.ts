import { ConnectionHandler } from './networking/connection.ts';
import { Server } from './server.ts';
import { Holder, Nullable, Services } from './types.ts';
import { World } from './world.ts';
import * as vec from '../libs/vec.ts';
import { Block, blocks, blocksIdsToName } from './blocks.ts';

export class Player {
	username: string;
	readonly uuid: string;
	readonly numId: number;
	readonly ip: string;
	client: string;
	service: Services;
	position: [number, number, number];
	pitch: number;
	yaw: number;
	permissions: Holder<Nullable<boolean>>;
	groups: string[];
	world: World;
	isInWorld: boolean;
	isConnected: boolean;

	readonly _server: Server;
	readonly _connectionHandler: ConnectionHandler;

	constructor(uuid: string, username: string, client: string, service: Services, connection: ConnectionHandler, server: Server) {
		this.ip = connection.ip;

		this.username = username;
		this.service = service;

		let numId = -1;
		for (let x = 0; x < 127; x++) {
			if (!server._takenPlayerIds.includes(x)) {
				numId = x;
				break;
			}
		}

		if (numId == -1) {
			throw 'Server full!';
		}

		this.numId = numId;
		server._takenPlayerIds.push(this.numId);
		this.uuid = uuid;
		this.client = client;
		this._server = server;
		this.isInWorld = false;
		this.isConnected = true;
		this._connectionHandler = connection;

		const data = server.files.getPlayer(uuid);

		if (data != null) {
			this.position = data.position;
			this.permissions = data.permissions;
			this.groups = [...data.groups];
			this.groups.includes('default') ? null : this.groups.push('default');
			this.world = server.worlds[data.world];
			this.pitch = data.pitch;
			this.yaw = data.yaw;
		} else {
			this.world = server.worlds[server.config.defaultWorldName];

			this.position = this.world.spawnPoint;
			this.yaw = this.world.spawnPointYaw;
			this.pitch = this.world.spawnPointPitch;
			this.permissions = {};
			this.groups = ['default'];
		}

		connection.setPlayer(this);
	}

	async changeWorld(world: World) {
		const result = this._server.event.PlayerChangeWorld._emit({ player: this, from: this.world, to: world });

		if (result) {
			this.world._removePlayer(this);
			this.isInWorld = false;

			await this._connectionHandler.sendWorld(world);

			this.world._addPlayer(this);
			this.isInWorld = true;
			this.position = [...this.world.spawnPoint];
			this.yaw = this.world.spawnPointYaw;
			this.pitch = this.world.spawnPointPitch;
		}
	}

	async teleport(world: World, x: number, y: number, z: number, yaw?: number, pitch?: number) {
		const result = this._server.event.PlayerTeleport._emit({ player: this, position: [x, y, z], world, yaw, pitch });

		if (result) {
			if (this.world != world) {
				await this.changeWorld(world);
			}

			this.world._movePlayer(this, [x, y, z], yaw ?? this.yaw, pitch ?? this.pitch);

			this.position = [x, y, z];
			this.pitch = pitch ?? this.pitch;
			this.yaw = yaw ?? this.yaw;
		}
	}

	sendMessage(message: string, player?: Player) {
		this._connectionHandler.sendMessage(player ?? null, message);
	}

	executeCommand(command: string) {
		const x = command.split(' ');
		const result = this._server.event.PlayerCommand._emit({ player: this, command });

		if (result) {
			if (this._server._commands[x[0]] != undefined) {
				this._server._commands[x[0]].execute({ server: this._server, player: this, command, send: (t) => this.sendMessage(t) });
				return true;
			}
			return false;
		}

		return true;
	}

	disconnect(reason?: string) {
		this._removeFromServer();

		this._server.event.PlayerDisconnect._emit({ player: this, reason: reason ?? 'Disconnected!' });

		this._server.sendChatMessage(this._server.getMessage('leave', { player: this.username }), this);
		this._connectionHandler.disconnect(reason ?? 'Disconnected!');

		this._server.files.savePlayer(this.uuid, this.getPlayerData());
	}

	_removeFromServer() {
		this.isInWorld = false;
		this.isConnected = false;
		this.world._removePlayer(this);
		delete this._server.players[this.uuid];
		this._server._takenPlayerIds.splice(this._server._takenPlayerIds.indexOf(this.numId));
	}

	getPlayerData(): PlayerData {
		return {
			position: this.position,
			uuid: this.uuid,
			permissions: this.permissions,
			groups: this.groups,
			username: this.username,
			world: this.world.fileName,
			pitch: this.pitch,
			yaw: this.yaw,
			ip: this.ip,
		};
	}

	_action_move(x: number, y: number, z: number, yaw: number, pitch: number) {
		if (vec.equals([x, y, z], this.position)) {
			return;
		}

		const result = this._server.event.PlayerMove._emit({ player: this, position: [x, y, z], pitch, yaw });

		if (result) {
			this.world._movePlayer(this, [x, y, z], yaw, pitch);
			this.position = [x, y, z];
			this.pitch = pitch;
			this.yaw = yaw;

			const colides: Player[] = [];
			this.world.players.forEach((p) => {
				if (p == this) {
					return;
				}
				if (vec.dist(this.position, p.position) < 3 && this._checkColision(p)) {
					colides.push(p);
				}
			});

			if (colides.length > 0) {
				this._server.event.PlayerColides._emit({ player: this, with: colides });
			}
		} else {
			this._connectionHandler.sendTeleport(this, this.position, this.yaw, this.pitch);
		}
	}

	_action_block_place(x: number, y: number, z: number, block: number) {
		if (!this.world.isInBounds(x, y, z) || !(<Holder<Block>>blocks)[blocksIdsToName[block]].placeable) {
			this._connectionHandler.setBlock(x, y, z, this.world.getBlock(x, y, z));
			return;
		}

		const result = this._server.event.PlayerBlockPlace._emit({ player: this, position: [x, y, z], block, world: this.world });

		if (result) {
			this.world.setBlock(x, y, z, block);
		} else {
			this._connectionHandler.setBlock(x, y, z, this.world.getBlock(x, y, z));
		}
	}

	_action_block_break(x: number, y: number, z: number, block: number) {
		if (!this.world.isInBounds(x, y, z) || !(<Holder<Block>>blocks)[blocksIdsToName[block]].placeable) {
			this._connectionHandler.setBlock(x, y, z, this.world.getBlock(x, y, z));
			return;
		}
		
		const result = this._server.event.PlayerBlockBreak._emit({ player: this, position: [x, y, z], block, world: this.world });

		if (result) {
			this.world.setBlock(x, y, z, 0);
		} else {
			this._connectionHandler.setBlock(x, y, z, this.world.getBlock(x, y, z));
		}
	}

	_action_chat_message(message: string) {
		if (message.startsWith('/')) {
			const result = this.executeCommand(message.slice(1));
			if (!result) {
				this.sendMessage(this._server.getMessage('nocommand', {}));
			}
		} else {
			const result = this._server.event.PlayerMessage._emit({ player: this, message: message });

			if (result) {
				this._server.sendChatMessage(this._server.getMessage('chat', { player: this.username, message: message }), this);
			}
		}
	}

	checkColision(player: Player): boolean {
		if (this.world != player.world || vec.dist(this.position, player.position) > 3) {
			return false;
		}

		return this._checkColision(player);
	}

	_checkColision(player: Player): boolean {
		const selfMax = vec.add(this.position, [0.4, 1.8, 0.4]);
		const selfMin = vec.add(this.position, [-0.4, 0, -0.4]);

		const playerMax = vec.add(player.position, [0.4, 1.8, 0.4]);
		const playerMin = vec.add(player.position, [-0.4, 0, -0.4]);

		if (playerMin[0] > selfMax[0]) return false;
		if (playerMin[1] > selfMax[1]) return false;
		if (playerMin[2] > selfMax[2]) return false;
		if (playerMax[0] < selfMin[0]) return false;
		if (playerMax[1] < selfMin[1]) return false;
		if (playerMax[2] < selfMin[2]) return false;

		return true;
	}
}

export interface PlayerData {
	position: [number, number, number];
	username: string;
	uuid: string;
	permissions: { [i: string]: true | false | null };
	groups: string[];
	world: string;
	pitch: number;
	yaw: number;
	ip: string;
}
