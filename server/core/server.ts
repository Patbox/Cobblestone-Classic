import { Emitter } from '../libs/emitter.ts';
import { Player, PlayerData } from './player.ts';
import { World, WorldData, WorldGenerator } from './world/world.ts';

import * as event from './events.ts';
import { AuthData, Holder, Command, GroupInterface, Plugin, Nullable, XYZ } from './types.ts';
import { ConnectionHandler } from './networking/connection.ts';
import { setupGenerators } from './world/generators.ts';
import { semver } from './deps.ts';
import { blocks, blockIds, blocksIdsToName } from './world/blocks.ts';
import { setupCommands } from './commands.ts';

export class Server {
	// Main informations about server
	static readonly softwareName = 'Cobblestone';
	static readonly softwareId = 'cobblestone';
	static readonly softwareVersion = '0.0.8';
	
	static readonly targetGame = 'Minecraft Classic';
	static readonly targetVersion = '0.30c';

	// Copy some of it to class instances
	readonly softwareName = Server.softwareName;
	readonly softwareVersion = Server.softwareVersion;
	readonly softwareId = Server.softwareId;
	readonly targetGame = Server.targetGame;
	readonly targetVersion = Server.targetVersion;
	// Version of API, goes up when new methods are added
	readonly _apiVersion = '0.0.8';

	// Minimal compatible API
	readonly _minimalApiVersion = '0.0.6';

	/**
	 * Wrapper to access filesystem. Used mostly to abstract stuff
	 */
	readonly files: IFileHelper;

	/**
	 * Logger with full color code support
	 */
	readonly logger: ILogger;

	/**
	 * Checks if devMode is on
	 */
	readonly devMode: boolean;

	/**
	 * All main server, player and world events
	 */
	readonly event = {
		PlayerConnect: new Emitter<event.PlayerConnect>(true),
		PlayerDisconnect: new Emitter<event.PlayerDisconnect>(true),
		PlayerChangeWorld: new Emitter<event.PlayerChangeWorld>(true),
		PlayerMove: new Emitter<event.PlayerMove>(true),
		PlayerColides: new Emitter<event.PlayerColides>(true),
		PlayerMessage: new Emitter<event.PlayerMessage>(true),
		PlayerTeleport: new Emitter<event.PlayerTeleport>(true),
		PlayerBlockBreak: new Emitter<event.PlayerChangeBlock>(true),
		PlayerBlockPlace: new Emitter<event.PlayerChangeBlock>(true),
		PlayerCommand: new Emitter<event.PlayerCommand>(true),
		ServerShutdown: new Emitter<Server>(),
		ServerLoadingFinished: new Emitter<Server>(),
		ServerCommandRegistration: new Emitter<Server>(),
	};

	readonly worlds: Holder<World> = {};
	readonly players: Holder<Player> = {};
	protected readonly _generators: Holder<WorldGenerator> = {};
	protected readonly _commands: Holder<Command> = {};
	protected readonly _plugins: Holder<Plugin> = {};
	protected _playerUUIDCache: Holder<string> = {};

	readonly blocks = blocks;
	readonly blockIds = blockIds;
	readonly blockIdsToNames = blocksIdsToName;

	readonly groups: Holder<Group> = {};

	readonly classicTextRegex = /[^ -~]/gi;

	config: IConfig = defaultConfig;

	readonly _takenPlayerIds: number[] = [];

	protected _autoSaveInterval = -1;
	protected _autoBackupInterval = -1;

	_loaded = false;

	isRunning = false;
	isShuttingDown = false;

	constructor(files: IFileHelper, logger: ILogger, devMode = false) {
		this.files = files;
		logger.showDebug = devMode;
		this.logger = logger;
		this.devMode = devMode;
	}

	/**
	 * Starts a server, DON'T run it from plugins, it will throw an error
	 */
	async _startServer() {
		if (this.isRunning) {
			throw new Error("You can't start server twice!");
		}

		try {
			this.logger.log(`&aStarting ${Server.softwareName} ${Server.softwareVersion} server for ${Server.targetGame} ${Server.targetVersion}...`);
			this.logger.debug(`&cDev mode is active! If you are running public server, you should start it normally (with run.bat/sh) instead!`);

			const d = Date.now();

			if (this.files.existConfig('config')) {
				const tmp = <IConfig>this.files.getConfig('config');
				this.config = { ...defaultConfig, ...tmp };
				(<Holder<string>>this.config.messages) = { ...defaultConfig.messages, ...(tmp.messages ?? {}) };
				this.logger.debug(`Loaded config`);
			} else {
				this.config = { ...defaultConfig };
				this.logger.debug(`Coping default config...`);
			}

			if (this.files.existConfig('groups')) {
				const temp = <Holder<GroupInterface>>this.files.getConfig('groups');
				for (const x in temp) {
					this.groups[x] = new Group(temp[x]);
				}
				this.logger.debug(`Loaded groups`);
			} else {
				this.groups['default'] = new Group({ name: 'default', permissions: {} });
				this.logger.debug(`Creating default group`);
			}

			if (this.files.existConfig('.uuidcache')) {
				this._playerUUIDCache = { ...(<Holder<string>>this.files.getConfig('.uuidcache')) };
				this.logger.debug(`Loaded player cache`);
			} else {
				this._playerUUIDCache = {};
			}

			this.files.saveConfig('config', this.config);
			this.files.saveConfig('groups', this.groups);

			setupGenerators(this);
			this.logger.debug(`Default generators are setuped!`);

			this.loadWorld(this.config.defaultWorldName) ?? this.createWorld(this.config.defaultWorldName, [256, 128, 256], this._generators['grasslands']);

			Object.values(this.worlds).forEach((world) => {
				this.files.saveWorld(`backup/${world.fileName}-${this.formatDate(new Date())}`, world);
			});

			if (this.config.autoSaveInterval > 0) {
				this._autoSaveInterval = setInterval(() => {
					this.logger.debug(`Autosave started!`);
					const d = Date.now();
					Object.values(this.worlds).forEach((world) => {
						this.saveWorld(world);
					});
					this.logger.debug(`Autosave ended! It took ${Date.now() - d} ms!`);
				}, 1000 * 60 * this.config.autoSaveInterval);
			}
			if (this.config.backupInterval > 0) {
				this._autoBackupInterval = setInterval(() => {
					this.logger.debug(`Backup started!`);
					const d = Date.now();
					Object.values(this.worlds).forEach((world) => {
						this.files.saveWorld(`backup/${world.fileName}-${this.formatDate(new Date())}`, world);
					});
					this.logger.debug(`Backup ended! It took ${Date.now() - d} ms!`);
				}, 1000 * 60 * this.config.backupInterval);
			}

			setupCommands(this, this._commands);
			this.logger.debug(`Added default commands`);

			try {
				this.logger.debug(`Plugin loading started!`);
				const d = Date.now();
				await this._startLoadingPlugins();
				this.logger.debug(`Loaded plugins! It took ${Date.now() - d} ms!`);
			} catch (e) {
				this.logger.debug(`Oh no`);
				this.logger.error('Error occured while loading plugins!');
				this.logger.error(e);

				this.stopServer();
			}

			this.event.ServerCommandRegistration._emit(this);

			this.files.listWorlds().forEach((x) => this.loadWorld(x));

			try {
				this._startListening();
			} catch (e) {
				this.logger.error(e);
				this.stopServer();
			}

			this._loaded = true;
			this.event.ServerLoadingFinished._emit(this);

			this.logger.log(`Server started! It took ${Date.now() - d} ms!`);
		} catch (e) {
			this.logger.critical(`Server crashed!`);
			this.logger.critical(e);
		}
	}

	// Needs to be implemented by extended class
	protected _startListening() {}
	protected _startLoadingPlugins() {}

	/**
	 * Stops server
	 */
	stopServer() {
		this.isShuttingDown = true;
		this.logger.log('&6Closing server...');
		this.files.saveConfig('config', this.config);
		this.files.saveConfig('groups', this.groups);
		this.files.saveConfig('.uuidcache', this._playerUUIDCache);
		this.logger.debug(`Saved default configs`);
		try {
			this.event.ServerShutdown._emit(this);
		} catch {
			this.logger.critical(`Shutdown event couldn't be processed! Plugin data might get corrupted!`);
		}

		try {
			Object.values(this.players).forEach((player) => {
				player.disconnect('Server closed');
			});
			this.logger.debug(`Players kicked`);
		} catch {
			this.logger.critical(`Error occured while saving players! Data might get corrupted!`);
		}

		try {
			Object.values(this.worlds).forEach((world) => {
				this.saveWorld(world);
			});

			this.logger.debug(`Worlds saved`);
		} catch {
			this.logger.critical(`Error occured while saving worlds! Data might get corrupted!`);
		}
	}

	/**
	 * Connects player (can be virtual!) to server.
	 *
	 * @param conn Main connection handler, used for handling packets
	 * @param client Name of player's client, defaults to `Classic`
	 * @param overrides Allows to override authentication data
	 */
	connectPlayer(conn: ConnectionHandler, client?: string, overrides?: AuthData) {
		try {
			conn._server = this;
			this.logger.conn(`Connection from ${conn.ip}:${conn.port}...`);
			conn._clientPackets.PlayerIdentification.once(async ({ value: playerInfo }) => {
				if (playerInfo.protocol != 0x07) {
					conn.disconnect('Unsupported protocol!');
					return;
				}

				conn.sendServerInfo(this);

				const result = await this.authenticatePlayer({
					uuid: overrides?.uuid ?? playerInfo.username.toLowerCase(),
					username: overrides?.username ?? playerInfo.username,
					service: overrides?.service ?? 'Minecraft',
					secret: overrides?.secret ?? playerInfo.key,
					authenticated: overrides?.authenticated ?? false,
					subService: overrides?.subService ?? null,
				});

				if (result.allow) {
					const subService = result.auth.subService ? `/${result.auth.subService}` : '';
					this.logger.conn(
						result.auth.service == 'Unknown'
							? `User ${result.auth.username} (${result.auth.uuid}) doesn't use any auth...`
							: `User ${result.auth.username} (${result.auth.uuid}) is logged with ${result.auth.service}${subService} auth!`
					);

					const player = new Player(
						result.auth.uuid ?? 'offline-' + result.auth.username.toLowerCase(),
						result.auth.username,
						client ?? 'Classic',
						result.auth.service,

						conn,
						this
					);
					this.players[player.uuid] = player;
					this._playerUUIDCache[player.username.toLowerCase()] = player.uuid;

					player.changeWorld(player.world);
					this.sendChatMessage(this.getMessage('join', { player: player.getDisplayName() }), player);
				} else {
					conn.disconnect('You need to log in!');
				}
			});
		} catch (e) {
			this.logger.error('Disconnected player - ' + e);
			conn.disconnect(e);
		}
	}

	/**
	 * Allows to authenticate player, depends on implementation
	 *
	 * @param data Authentication data
	 * @returns validated auth data and checks if player can join
	 */
	authenticatePlayer(data: AuthData): Promise<{ auth: AuthData; allow: boolean }> {
		return new Promise((r) => r({ auth: data, allow: true }));
	}

	/**
	 * Executes command as server/console
	 *
	 * @param command Used command, without / symbol
	 * @returns If command was executed
	 */
	executeCommand(command: string): boolean {
		const cmd = this.getCommand(command);
		if (cmd != undefined) {
			cmd.execute({ server: this, player: null, command, send: this.logger.log, checkPermission: (x) => true });
			return true;
		}
		return false;
	}

	/**
	 * Sends a chat message to everyone on server (including console)
	 *
	 * @param message Formatted message
	 * @param player Player that send it, don't need to be set
	 */
	sendChatMessage(message: string, player?: Player) {
		Object.values(this.players).forEach((p) => p.sendMessage(message, player));

		this.logger.chat(message);
	}

	/**
	 * Saves passed world instance
	 *
	 * @param world World instance
	 * @returns If saving was successful
	 */
	saveWorld(world: World): boolean {
		return this.files.saveWorld(world.name, world);
	}

	/**
	 * Loads world by name
	 *
	 * @param name World name
	 * @returns World instance or null (if doesn't exist)
	 */
	loadWorld(name: string): Nullable<World> {
		try {
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
		} catch (e) {
			this.logger.error(`Couldn't load world ${name}!`);
			this.logger.error(e);
			return null;
		}
	}

	/**
	 * Unloads world from memory
	 *
	 * @param name World name
	 * @param save If world should be saved, defaults to true
	 * @returns True if successful, otherwise false
	 */

	unloadWorld(name: string, save = true): boolean {
		if (this.config.defaultWorldName == name) {
			return false;
		} else if (this.worlds[name] == undefined) {
			return true;
		} else if (save) {
			const x = this.saveWorld(this.worlds[name]);
			if (x) {
				delete this.worlds[name];
			}

			return x;
		} else {
			delete this.worlds[name];
			return true;
		}
	}

	/**
	 * Creates new world (if not loaded) or return existing one
	 *
	 * @param name World name
	 * @param size World size, each value needs to be bigger than 0 but smaller or equal to 1024
	 * @param generator WorldGenerator used to generate it
	 * @param seed Seed passed to generator, unspecified or 0 is random
	 * @param player Creator of world (optional)
	 * @returns Generated world or null (if it fails)
	 */
	createWorld(name: string, size: XYZ, generator: WorldGenerator, seed?: number, player?: Player): Nullable<World> {
		try {
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
						username: player?.username ?? `${this.softwareName} - ${generator.name}`,
						uuid: player?.uuid ?? 'Unknown',
					},
					spawnPoint: [size[0] / 2, size[1] / 2 + 20, size[2] / 2],
				},
				this
			);

			generator.generate(world);
			world.spawnPoint[1] = world.getHighestBlock(world.spawnPoint[0], world.spawnPoint[2], true);

			this.worlds[name] = world;

			this.saveWorld(world);

			return world;
		} catch (e) {
			this.logger.error(
				`Couldn't create world ${name} (size: ${size}, generator: ${generator?.name}, seed: ${seed ?? 0}, player: ${player?.username ?? null})!`
			);
			this.logger.error(e);
			return null;
		}
	}

	/**
	 * Adds plugin
	 *
	 * @param plugin Plugin instance
	 * @param altid Alternative, optional name, should be used for better identification
	 * @returns Promise of Plugin instance (if successful) or null
	 */

	async addPlugin(plugin: Plugin, altid?: string): Promise<Nullable<Plugin>> {
		const textId = altid != undefined ? `${plugin.id} | ${altid}` : plugin.id;
		this.logger.debug(`Plugin ${textId} was requested to be loaded`);

		if (!plugin.id || !plugin.init || !plugin.version || !plugin.cobblestoneApi) {
			altid ? this.logger.warn(`Plugin ${altid ?? '!NOID'} isn't a valid plguin. Skipping...`) : null;
			return null;
		}

		try {
			const api = semver.valid(plugin.cobblestoneApi);
			if (api != null) {
				if (semver.gte(api, this._minimalApiVersion)) {
					if (semver.lte(api, this.softwareVersion)) {
						this.logger.log(`Initializing plugin ${plugin.name} ${plugin.version}`);

						await plugin.init(this);

						this._plugins[plugin.id] = {
							...plugin,
							name: plugin.name ?? plugin.id,
							init: (x) => null,
						};

						return this._plugins[plugin.id];
					} else {
						this.logger.warn(`Plugin ${plugin.name} (${textId}) requires newer api version (${plugin.cobblestoneApi}). Skipping...`);
						return null;
					}
				} else {
					this.logger.warn(`Plugin ${plugin.name} (${textId}) requires outdated api version (${plugin.cobblestoneApi}). Skipping...`);
					return null;
				}
			}

			this.logger.warn(`Plugin ${plugin.name} (${textId}) declares usage of invalid api (${plugin.cobblestoneApi}). Skipping...`);
			return null;
		} catch (e) {
			this.logger.error(`Loading plugin ${plugin.name} (${textId}) caused an exception!`);
			this.logger.error(e);
			return null;
		}
	}

	/**
	 * Returns plugin based on it's id
	 *
	 * @param plugin Id of plugin
	 * @returns Plugin or null
	 */
	getPlugin(plugin: string): Nullable<Plugin> {
		return this._plugins[plugin] ?? null;
	}

	/**
	 * Adds new command
	 *
	 * @param command Command instance
	 * @returns Boolean indicating, if it was successful
	 */
	addCommand(command: Command): boolean {
		if (command.name.includes(' ')) {
			return false;
		}

		this._commands[command.name] = command;
		this.logger.debug(`Command ${command.name} added`);

		return true;
	}

	/**
	 * Allows to get command from string
	 *
	 * @param command
	 * @returns Command or null
	 */
	getCommand(command: string): Nullable<Command> {
		const x = command.split(' ');

		return this._commands[x[0]] ?? null;
	}

	/**
	 * Returns all commands (readonly)
	 */
	getAllCommands(): Readonly<Holder<Command>> {
		return this._commands;
	}

	/**
	 * Adds new generator to list of generators
	 *
	 * @param gen Generator instance
	 * @returns Boolean indicating, if operation was successful
	 */
	addGenerator(gen: WorldGenerator): boolean {
		this._generators[gen.name] = gen;
		this.logger.debug(`Generator ${gen.name} added`);

		return true;
	}

	/**
	 * Allows to get generator by name
	 *
	 * @param gen Generators name
	 * @returns WorldGenerator or null
	 */
	getGenerator(gen: string): Nullable<WorldGenerator> {
		return this._generators[gen] ?? null;
	}

	/**
	 * Returns all generators (readonly)
	 */
	getAllGenerators(): Readonly<Holder<WorldGenerator>> {
		return this._generators;
	}

	/**
	 * Gets and formats message from main config
	 *
	 * @param id Message id
	 * @param values Values
	 * @returns Formatted message
	 */
	getMessage(id: string, values: Holder<string>): string {
		let message = this.config.messages[id];

		if (message == undefined) {
			message = id;
		}

		for (const x in values) {
			message = message.replaceAll('$' + x.toUpperCase(), values[x]);
		}

		return message;
	}

	/**
	 * Allows to get player's uuid from username. Works only if player joined server at liest once.
	 *
	 * @param username Player's username
	 * @returns Player's UUID or null
	 */
	getPlayerIdFromName(username: string): Nullable<string> {
		return this._playerUUIDCache[username.toLowerCase()] ?? null;
	}

	/**
	 * Formats date
	 */
	static formatDate(date: number | Date, showTime = true): string {
		if (!(date instanceof Date)) {
			date = new Date(date);
		}

		return (
			`${date.getFullYear()}-${addZero(date.getMonth() + 1)}-${addZero(date.getDate())}` +
			(showTime ? `-${addZero(date.getHours())}-${addZero(date.getMinutes())}-${addZero(date.getSeconds())}` : '')
		);
	}

	formatDate = Server.formatDate;
}

export class Group implements GroupInterface {
	name: string;
	visibleName?: string;
	prefix?: string;
	sufix?: string;
	permissions: { [i: string]: Nullable<boolean> };

	constructor(data: GroupInterface) {
		this.name = data.name;
		this.visibleName = data.visibleName;
		this.prefix = data.prefix;
		this.sufix = data.sufix;
		this.permissions = data.permissions;
	}

	getName() {
		return this.visibleName ?? this.name;
	}

	setPermission(permission: string, value: Nullable<boolean>) {
		if (value == null) {
			delete this.permissions[permission];
		} else {
			this.permissions[permission] = value;
		}
	}

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

	checkPermissionExact(permission: string): Nullable<boolean> {
		if (this.permissions[permission] != null) {
			return !!this.permissions[permission];
		}

		return null;
	}
}

function addZero(n: number): string {
	return n > 9 ? n.toString() : '0' + n;
}

export interface ILogger {
	log(text: string): void;
	error(text: string): void;
	critical(text: string): void
	warn(text: string): void;
	chat(text: string): void;
	conn(text: string): void;
	debug(test: string): void;

	storedToFile: boolean;
	showDebug: boolean;
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
}

export interface IConfig {
	address: string;
	port: number;
	voxelSrvPort: number;

	serverName: string;
	serverMotd: string;

	maxPlayerCount: number;
	autoSaveInterval: number;
	backupInterval: number;

	defaultWorldName: string;

	classicOnlineMode: boolean;
	//useMineOnlineHeartbeat: boolean;
	//publicOnMineOnline: boolean;

	useBetaCraftHeartbeat: boolean;
	publicOnBetaCraft: boolean;

	VoxelSrvOnlineMode: boolean;
	publicOnVoxelSrv: boolean;

	allowOffline: boolean;

	VoxelSrvUseWSS: boolean;
	VoxelSrvWssOptions: { key: string; cert: string };

	messages: {
		join: string;
		leave: string;
		chat: string;
		serverStopped: string;
		noCommand: string;
		cheatDistance: string;
		cheatTile: string;
		cheatClick: string;
		cheatSpam: string;
		[i: string]: string;
	};
}

const defaultConfig: IConfig = {
	address: 'localhost',
	port: 25566,
	voxelSrvPort: 25567,

	serverName: 'Cobblestone',
	serverMotd: 'Another Minecraft Classic server!',

	maxPlayerCount: 20,
	autoSaveInterval: 5,
	backupInterval: 1440,

	defaultWorldName: 'main',

	classicOnlineMode: false,

	//useMineOnlineHeartbeat: false,
	//publicOnMineOnline: false,

	useBetaCraftHeartbeat: false,
	publicOnBetaCraft: false,

	VoxelSrvOnlineMode: false,
	publicOnVoxelSrv: false,
	allowOffline: true,

	VoxelSrvUseWSS: false,
	VoxelSrvWssOptions: { key: '', cert: '' },

	messages: {
		join: '&e$PLAYER joined the game',
		leave: '&e$PLAYER left the game',
		chat: '&f<$PLAYER> $MESSAGE',
		noCommand: "&cThis command doesn't exist or you don't have access to it",
		serverStopped: 'Server stopped!',
		cheatDistance: 'Cheat detected: Distance',
		cheatTile: 'Cheat detected: Tile type',
		cheatClick: 'Cheat detected: Too much clicking!',
		cheatSpam: "You've spammed too much",
	},
};
