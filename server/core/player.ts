import { ConnectionHandler } from './networking/connection.ts';
import { Server } from './server.ts';
import { Holder, Nullable, Services } from './types.ts';
import { World } from './world/world.ts';
import * as vec from '../libs/vec.ts';
import { Block, blocks, blocksIdsToName } from './world/blocks.ts';
import * as event from './events.ts';
import { EventContext } from '../libs/emitter.ts';

export class Player {
	readonly username: string;
	readonly uuid: string;
	readonly numId: number;
	readonly ip: string;
	readonly service: Services;

	displayName: Nullable<string> = null;
	client: string;
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
			this.displayName = data.displayName ?? null;
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

	/**
	 * Changes player's world to provided one;
	 *
	 * @param world World instacne
	 */
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

	/**
	 * Telepors player to provided location
	 *
	 * @param world World instance
	 * @param x X position
	 * @param y Y position
	 * @param z Z position
	 * @param yaw Player's yaw (optional)
	 * @param pitch Player's pitch (optional)
	 */
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

			this._connectionHandler.sendTeleport(this, [x, y, z], yaw ?? this.yaw, pitch ?? this.pitch);
		}
	}

	/**
	 * Sends message to player
	 *
	 * @param message Formatted message
	 * @param player Player sending it (optional)
	 */
	sendMessage(message: string, player?: Player) {
		this._connectionHandler.sendMessage(player ?? null, message);
	}

	/**
	 * Executes command as player
	 *
	 * @param command command without /
	 * @returns Boolean indicating, if executing was successful
	 */
	executeCommand(command: string) {
		const result = this._server.event.PlayerCommand._emit({ player: this, command });

		if (result) {
			const cmd = this._server.getCommand(command);
			if (cmd && (!cmd.permission || this.checkPermission(cmd.permission))) {
				cmd.execute({
					server: this._server,
					player: this,
					command,
					send: (t) => this.sendMessage(t),
					checkPermission: (x) => this.checkPermission(x),
				});
				return true;
			}
			return false;
		}

		return true;
	}

	/**
	 * Disconnects player
	 *
	 * @param reason Reason why player was disconnected (optional)
	 */
	disconnect(reason?: string) {
		this._removeFromServer();

		this._server.event.PlayerDisconnect._emit({ player: this, reason: reason ?? 'Disconnected!' });

		this._server.sendChatMessage(this._server.getMessage('leave', { player: this.username }), this);
		this._connectionHandler.disconnect(reason ?? 'Disconnected!');

		this._server.files.savePlayer(this.uuid, this.getPlayerData());
	}

	/**
	 * Sets player's permission
	 *
	 * @param permission Permission
	 * @param value Boolean for setting, null for deletion
	 */
	setPermission(permission: string, value: Nullable<boolean>) {
		if (value == null) {
			delete this.permissions[permission];
		} else {
			this.permissions[permission] = value;
		}
	}

	/**
	 * Checks if player has permission
	 *
	 * @param permission Permission
	 * @param value Boolean if it's set, null if it isn't (aka default)
	 */
	checkPermission(permission: string): Nullable<boolean> {
		{
			const check = this.checkPermissionExact(permission);
			if (check != null) {
				return check;
			}
		}
		{
			const check = this.checkPermissionExact('*');
			if (check != null) {
				return check;
			}
		}

		const splited = permission.split('.');
		let perm = '';

		for (let x = 0; x < splited.length; x++) {
			perm += splited[x] + '.';

			const check = this.checkPermissionExact(perm + '*');
			if (check != null) {
				return check;
			}
		}

		return null;
	}

	/**
	 * Checks if player has permission, excluding wildcart ones
	 *
	 * @param permission Permission
	 * @param value Boolean if it's set, null if it isn't (aka default)
	 */
	checkPermissionExact(permission: string): Nullable<boolean> {
		if (this.permissions[permission] != null) {
			return !!this.permissions[permission];
		}

		for (const groupName in this.groups) {
			const x = this._server.groups[groupName]?.checkPermissionExact(permission);

			if (x != null) {
				return x;
			}
		}

		return null;
	}

	/**
	 * Do not use unless you know what are you doing
	 *
	 * Removes player for server
	 */
	_removeFromServer() {
		this.isInWorld = false;
		this.isConnected = false;
		this.world._removePlayer(this);
		delete this._server.players[this.uuid];
		this._server._takenPlayerIds.splice(this._server._takenPlayerIds.indexOf(this.numId));
	}

	/**
	 * Returns player's data (same format as for saves)
	 *
	 * @returns PlayerData
	 */
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
			displayName: this.displayName,
		};
	}

	/**
	 * Returns player's display name
	 *
	 * @returns Display name
	 */
	getDisplayName(): string {
		return this.displayName ?? this.username;
	}

	/**
	 * Do not use unless you know what are you doing
	 */
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

	/**
	 * Do not use unless you know what are you doing
	 */
	_action_block_place(x: number, y: number, z: number, block: number) {
		if (!this.world.isInBounds(x, y, z) || !(<Holder<Block>>blocks)[blocksIdsToName[block]].placeable) {
			this._connectionHandler.setBlock(x, y, z, this.world.getBlockId(x, y, z));
			return;
		}

		const result = this._server.event.PlayerBlockPlace._emit({ player: this, position: [x, y, z], block, world: this.world });

		if (result) {
			this.world.setBlockId(x, y, z, block);
			this.world.lazyTickBlock(x, y, z);
		} else {
			this._connectionHandler.setBlock(x, y, z, this.world.getBlockId(x, y, z));
		}
	}

	/**
	 * Do not use unless you know what are you doing
	 */
	_action_block_break(x: number, y: number, z: number, block: number) {
		if (!this.world.isInBounds(x, y, z) || !(<Holder<Block>>blocks)[blocksIdsToName[block]]?.placeable) {
			this._connectionHandler.setBlock(x, y, z, this.world.getBlockId(x, y, z));
			return;
		}

		const result = this._server.event.PlayerBlockBreak._emit({ player: this, position: [x, y, z], block, world: this.world });

		if (result) {
			this.world.setBlockId(x, y, z, 0);
			for (let x2 = -1; x2 <= 1; x2++) {
				for (let y2 = -1; y2 <= 1; y2++) {
					for (let z2 = -1; z2 <= 1; z2++) {
						this.world.tickBlock(x + x2, y + y2, z + z2);
					}
				}
			}
		} else {
			this._connectionHandler.setBlock(x, y, z, this.world.getBlockId(x, y, z));
		}
	}

	/**
	 * Do not use unless you know what are you doing
	 */
	_action_chat_message(message: string) {
		if (message.startsWith('/')) {
			const result = this.executeCommand(message.slice(1));
			if (!result) {
				this.sendMessage(this._server.getMessage('noCommand', {}));
			}
		} else {
			const result = this._server.event.PlayerMessage._emit({ player: this, message: message });

			if (result) {
				this._server.sendChatMessage(this._server.getMessage('chat', { player: this.getDisplayName(), message: message }), this);
			}
		}
	}

	/**
	 * Allows to check if player colides with other player
	 *
	 * @param player Other player
	 * @returns Boolean indicating, if player colides
	 */
	checkColision(player: Player): boolean {
		if (this.world != player.world || vec.dist(this.position, player.position) > 3) {
			return false;
		}

		return this._checkColision(player);
	}

	/**
	 * Do not use unless you know what are you doing
	 * Use `Player.checkColision` instead
	 */
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
	displayName: Nullable<string>;
}

/**
 * VirtualPlayerHolder allows to modify some of player data while player is offline
 * It still works for online players
 */
export class VirtualPlayerHolder {
	readonly _server: Server;
	readonly uuid: string;

	protected player: Nullable<Player>;
	protected playerData: PlayerData;

	protected joinEvent: (ev: EventContext<event.PlayerConnect>) => void;
	protected leaveEvent: (ev: EventContext<event.PlayerDisconnect>) => void;

	constructor(uuid: string, server: Server) {
		this.uuid = uuid;
		this._server = server;

		this.player = server.players[uuid] ?? null;
		this.playerData = this.player?.getPlayerData() ?? server.files.getPlayer(uuid);

		if (!this.playerData) {
			throw 'No player!';
		}

		this.joinEvent = (ev: EventContext<event.PlayerConnect>) => {
			if (ev.value.player.uuid == uuid) {
				this.player = ev.value.player;
				if (this.player) {
					this.player.groups = this.playerData.groups;
					this.player.permissions = this.playerData.permissions;
					this.player.displayName = this.playerData.displayName;
				}
			}
		};

		this.leaveEvent = (ev: EventContext<event.PlayerDisconnect>) => {
			if (ev.value.player.uuid == uuid) {
				this.player = null;
				this.playerData = ev.value.player.getPlayerData();
			}
		};

		this._server.event.PlayerConnect.on(this.joinEvent);
		this._server.event.PlayerDisconnect.on(this.leaveEvent);
	}

	/**
	 * Saves all changes
	 */
	finish() {
		if (!this.player && this.playerData) {
			this._server.files.savePlayer(this.uuid, this.playerData);
			this.player = null;

			this._server.event.PlayerConnect.remove(this.joinEvent);
			this._server.event.PlayerDisconnect.remove(this.leaveEvent);
		}
	}

	/**
	 * Sets player's permission
	 *
	 * @param permission Permission
	 * @param value Boolean for setting, null for deletion
	 */
	setPermission(permission: string, value: Nullable<boolean>) {
		const perms: Holder<Nullable<boolean>> = this.player?.permissions ?? this.playerData.permissions;

		if (value == null) {
			delete perms[permission];
		} else {
			perms[permission] = value;
		}
	}

	/**
	 * Sets player's permission
	 *
	 * @param permission Permission
	 * @param value Boolean for setting, null for deletion
	 */
	checkPermission(permission: string): Nullable<boolean> {
		{
			const check = this.checkPermissionExact(permission);
			if (check != null) {
				return check;
			}
		}
		{
			const check = this.checkPermissionExact('*');
			if (check != null) {
				return check;
			}
		}

		const splited = permission.split('.');
		let perm = '';

		for (let x = 0; x < splited.length; x++) {
			perm += splited[x] + '.';

			const check = this.checkPermissionExact(perm + '*');
			if (check != null) {
				return check;
			}
		}

		return null;
	}

	/**
	 * Checks if player has permission, excluding wildcart ones
	 *
	 * @param permission Permission
	 * @param value Boolean if it's set, null if it isn't (aka default)
	 */
	checkPermissionExact(permission: string): Nullable<boolean> {
		const perms: Holder<Nullable<boolean>> = this.player?.permissions ?? this.playerData.permissions;
		const groups: string[] = this.player?.groups ?? this.playerData.groups;

		if (perms[permission] != null) {
			return !!perms[permission];
		}

		for (const groupName in groups) {
			const group = this._server.groups[groupName];

			if (group != null) {
				if (group.permissions[permission] != null) {
					return !!group.permissions[permission];
				}
			}
		}

		return null;
	}

	/**
	 * Adds player to group
	 *
	 * @param group
	 */
	addGroup(group: string) {
		this.player ? arrayAddOnce(this.player.groups, group) : arrayAddOnce(this.playerData.groups, group);
	}

	/**
	 * Removes player from group
	 *
	 * @param group
	 */
	removeGroup(group: string) {
		this.player ? arrayRemove(this.player.groups, group) : arrayRemove(this.playerData.groups, group);
	}

	/**
	 * Gets Player's display name
	 */
	getDisplayName() {
		return this.player?.displayName ?? this.playerData.displayName;
	}

	/**
	 * Sets Player's display name
	 */
	setDisplayName(name: string) {
		this.player ? (this.player.displayName = name) : (this.playerData.displayName = name);
	}

	/**
	 * Returns player's display name (for chat)
	 */
	getName() {
		return this.player?.username ?? this.playerData.username;
	}
}

function arrayAddOnce(a: unknown[], b: unknown) {
	!a.includes(b) ? a.push(b) : null;
}

function arrayRemove(a: unknown[], b: unknown) {
	const x = a.indexOf(b);

	x > -1 ? a.splice(x) : null;
}
