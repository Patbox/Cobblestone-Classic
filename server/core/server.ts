import { Emitter } from '../libs/emitter.ts';
import { Player, PlayerData } from './player.ts';
import { World, WorldData, WorldGenerator } from './world.ts';

import * as event from './events.ts';
import { AuthData, Nullable, Services, XYZ } from './types.ts';
import { ConnectionHandler } from './networking/connection.ts';
import { setupGenerators } from './generators.ts';

export class Server {
	softwareName = 'Cobblestone';
	softwareVersion = '0.0.0';

	files: IFileHelper;
	logger: ILogger;
	event = {
		PlayerConnect: new Emitter<event.PlayerConnect>(),
		PlayerDisconnect: new Emitter<event.PlayerDisconnect>(),
		PlayerChangeWorld: new Emitter<event.PlayerChangeWorld>(),
		PlayerMove: new Emitter<event.PlayerMove>(),
		PlayerMessage: new Emitter<event.PlayerMessage>(),
		PlayerTeleport: new Emitter<event.PlayerTeleport>(),
		PlayerBlockBreak: new Emitter<event.PlayerChangeBlock>(),
		PlayerBlockPlace: new Emitter<event.PlayerChangeBlock>(),
		PlayerCommand: new Emitter<event.PlayerCommand>(),
	};

	worlds: { [i: string]: World } = {};
	players: { [i: string]: Player } = {};
	generators: { [i: string]: WorldGenerator } = {};
	commands: { [i: string]: ICommand } = {};
	config: IConfig;

	_takenPlayerIds: number[] = [];

	_autoSaveInterval = -1;
	_autoBackupInterval = -1;

	constructor(files: IFileHelper, logger: ILogger) {
		logger.log(`&aStarting ${this.softwareName} ${this.softwareVersion} server...`);

		this.files = files;
		this.logger = logger;

		files.createBaseDirectories();

		if (files.existConfig('config')) {
			this.config = { ...defaultConfig, ...<IConfig>files.getConfig('config') };
		} else {
			this.config = { ...defaultConfig };
		}

		files.saveConfig('config', this.config);

		setupGenerators(this);

		this.loadWorld(this.config.defaultWorldName) ?? this.createWorld(this.config.defaultWorldName, [256, 64, 256], this.generators['grasslands']);

		Object.values(this.worlds).forEach((world) => {
			this.files.saveWorld(`backup/${world.fileName}-${new Date()}`, world);
		});

		if (this.config.autoSaveInterval > 0) {
			this._autoSaveInterval = setInterval(() => {
				Object.values(this.worlds).forEach((world) => {
					this.saveWorld(world);
				});
			}, 1000 * 60 * this.config.autoSaveInterval);
		}
		if (this.config.autoSaveInterval > 0) {
			this._autoBackupInterval = setInterval(() => {
				Object.values(this.worlds).forEach((world) => {
					this.files.saveWorld(`backup/${world.fileName}-${new Date()}`, world);
				});
			}, 1000 * 60 * this.config.backupInterval);
		}

		this.startListening();

		logger.log('Server started!');
	}

	startListening() {}

	stopServer() {
		this.logger.log('&6Closing server...');

		Object.values(this.players).forEach((player) => {
			player.disconnect('Server closed');
		});

		Object.values(this.worlds).forEach((world) => {
			this.saveWorld(world);
		});
	}

	connectPlayer(conn: ConnectionHandler, client?: string, overrides?: AuthData) {
		try {
			conn._clientPackets.PlayerIdentification.once(async ({ value: playerInfo }) => {
				conn.sendServerInfo(this);

				const result = await this.authenticatePlayer({
					uuid: overrides?.uuid ?? playerInfo.username.toLowerCase(),
					username: overrides?.username ?? playerInfo.username,
					service: overrides?.service ?? 'Minecraft',
					secret: overrides?.secret ?? playerInfo.key,
					authenticated: overrides?.authenticated ?? false,
				});

				if (result.allow) {
					const player = new Player(
						result.auth.username,
						result.auth.username,
						client ?? 'Classic',
						result.auth.service,

						conn,
						this
					);
					this.players[player.uuid] = player;

					player.changeWorld(player.world);
					this.sendChatMessage(player, `&a${player.username} joined the game.`);
				} else {
					conn.disconnect('You need to log in!');
				}
			});
		} catch (e) {
			conn.disconnect(e);
		}
	}

	authenticatePlayer(data: AuthData): Promise<{ auth: AuthData; allow: boolean }> {
		return new Promise((r) => r({ auth: data, allow: true }));
	}

	executeCommand(command: string): boolean {
		const x = command.split(' ');

		if (this.commands[x[0]] != undefined) {
			this.commands[x[0]].execute({ server: this, player: null, command, send: this.logger.log });
			return true;
		}

		return false;
	}

	sendChatMessage(player: Player, message: string) {
		Object.values(this.players).forEach((p) => p.sendMessage(player, message));
	}

	saveWorld(world: World): boolean {
		return this.files.saveWorld(world.name, world);
	}

	loadWorld(name: string): Nullable<World> {
		if (this.worlds[name] != undefined) {
			return this.worlds[name];
		} else {
			const data = this.files.getWorld(name);

			if (data != null) {
				const world = new World(name, data, this);
				this.worlds[name] = world;
				return world;
			}
			return null;
		}
	}

	unloadWorld(name: string): boolean {
		if (this.config.defaultWorldName == name) {
			return false;
		} else if (this.worlds[name] == undefined) {
			return true;
		} else {
			const x = this.saveWorld(this.worlds[name]);
			if (x) {
				delete this.worlds[name];
			}

			return x;
		}
	}

	createWorld(name: string, size: XYZ, generator: WorldGenerator, seed?: number, player?: Player): Nullable<World> {
		if (this.worlds[name] != undefined) {
			return this.worlds[name];
		}

		const world = new World(
			name.toLowerCase().replace(' ', '_'),
			{
				name,
				size,
				generator: { software: this.softwareName, type: generator.name },
				createdBy: {
					service: player?.service ?? 'Unknown',
					username: player?.service ?? `${this.softwareName} - ${generator.name}`,
				},
				spawnPoint: [size[0] / 2, size[1] / 2 + 20, size[2] / 2],
			},
			this
		);

		generator.generate(world);

		this.worlds[name] = world;

		this.saveWorld(world);

		return world;
	}
}

export interface ILogger {
	log(text: string): void;
	error(text: string): void;
	warn(text: string): void;
	chat(text: string): void;
	player(text: string): void;

	storedToFile: boolean;
}

export interface IFileHelper {
	saveConfig(namespace: string, config: unknown): boolean;
	getConfig(namespace: string): Nullable<unknown>;
	existConfig(namespace: string): boolean;

	saveWorld(name: string, world: World): boolean;
	getWorld(namespace: string): Nullable<WorldData>;
	existWorld(name: string): boolean;
	listWorlds(): string[];

	savePlayer(uuid: string, player: PlayerData): boolean;
	getPlayer(uuid: string): Nullable<PlayerData>;
	existPlayer(uuid: string): boolean;
	listPlayers(): string[];

	createBaseDirectories(): void;
}

export interface IConfig {
	address: string;
	port: number;

	serverName: string;
	serverMotd: string;

	maxPlayerCount: number;
	autoSaveInterval: number;
	backupInterval: number;

	defaultWorldName: string;

	useMineOnlineHeartbeat: boolean;
	classicOnlineMode: boolean;
	publicOnMineOnline: boolean;

	VoxelSrvOnlineMode: boolean;
	publicOnVoxelSrv: boolean;
	allowOffline: boolean;
}

const defaultConfig: IConfig = {
	address: 'localhost',
	port: 25566,

	serverName: 'Cobblestone',
	serverMotd: 'Another Minecraft Classic server!',

	maxPlayerCount: 20,
	autoSaveInterval: 5,
	backupInterval: 1440,

	defaultWorldName: 'main',

	useMineOnlineHeartbeat: false,
	classicOnlineMode: false,
	publicOnMineOnline: false,

	VoxelSrvOnlineMode: false,
	publicOnVoxelSrv: false,
	allowOffline: true,
};

export interface ICommand {
	name: string;
	description: string;
	execute: (ctx: ICommandContext) => void;
}

export interface ICommandContext {
	command: string;
	player: Nullable<Player>;
	server: Server;
	send: (text: string) => void;
}
