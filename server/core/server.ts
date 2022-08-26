import { Emitter, EventCallback, EventErrorHandler } from '../libs/emitter.ts';
import { Player, PlayerData, VirtualPlayerHolder } from './player.ts';
import { GenerationStatusListener, PhysicsLevel, World, WorldData, WorldGenerator } from './world/world.ts';

import * as event from './events.ts';
import { AuthData, Holder, GroupInterface, Plugin, Nullable, XYZ, HelpPage, TriState } from './types.ts';
import { ConnectionHandler } from './networking/connection.ts';
import { setupGenerators, emptyGenerator } from './builtin/generators.ts';
import { Semver } from './deps.ts';
import { blocks, blockIds, blocksIdsToName, Block } from './world/blocks.ts';
import { setupCommands } from './builtin/commands.ts';
import { CommandDispatcher, CommandSyntaxError, LiteralArgumentBuilder } from "../libs/brigadier/index.ts";
import { CommandInfo, CommandSource, ErrorTypes } from "./commands.ts";

export class Server {
	// Main informations about server
	static readonly softwareName = 'Cobblestone';
	static readonly softwareId = 'cobblestone';
	static readonly softwareVersion = '0.0.20';

	static readonly targetGame = 'Minecraft Classic';
	static readonly targetVersion = '0.30c';
	static readonly targetProtocol = 0x07;

	// Copy some of it to class instances
	readonly softwareName = Server.softwareName;
	readonly softwareVersion = Server.softwareVersion;
	readonly softwareId = Server.softwareId;
	readonly targetGame = Server.targetGame;
	readonly targetVersion = Server.targetVersion;
	readonly targetProtocol = Server.targetProtocol;

	// Version of API, goes up when new methods are added
	readonly _apiVersion = '0.0.20';

	// Minimal compatible API
	readonly _minimalApiVersion = '0.0.16';

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

	// deno-lint-ignore no-explicit-any
	private eventErrorBuilder = (emitterName: string): EventErrorHandler<any> => {
		// deno-lint-ignore no-explicit-any
		return (_emitter: Emitter<any>, event: EventCallback<any> | null, error: string) => {
			this.logger.error(`Error occured while executing event ${emitterName} (${event?.name ?? event}) - ${error}`)
		}
	}

	/**
	 * All main server, player and world events
	 */
	readonly event = Object.freeze({
		PlayerConnect: new Emitter<event.PlayerConnect>(true, this.eventErrorBuilder('PlayerConnect')),
		PlayerDisconnect: new Emitter<event.PlayerDisconnect>(true, this.eventErrorBuilder('PlayerDisconnect')),
		PlayerChangeWorld: new Emitter<event.PlayerChangeWorld>(true, this.eventErrorBuilder('PlayerChangeWorld')),
		PlayerMove: new Emitter<event.PlayerMove>(true, this.eventErrorBuilder('PlayerMove')),
		PlayerColides: new Emitter<event.PlayerColides>(true, this.eventErrorBuilder('PlayerColides')),
		PlayerMessage: new Emitter<event.PlayerMessage>(true, this.eventErrorBuilder('PlayerMessage')),
		PlayerTeleport: new Emitter<event.PlayerTeleport>(true, this.eventErrorBuilder('PlayerTeleport')),
		PlayerBlockBreak: new Emitter<event.PlayerChangeBlock>(true, this.eventErrorBuilder('PlayerBlockBreak')),
		PlayerBlockPlace: new Emitter<event.PlayerChangeBlock>(true, this.eventErrorBuilder('PlayerBlockPlace')),
		PlayerCommand: new Emitter<event.PlayerCommand>(true),
		ServerShutdown: new Emitter<Server>(false, this.eventErrorBuilder('ServerShutdown')),
		ServerLoadingFinished: new Emitter<Server>(false, this.eventErrorBuilder('ServerLoadingFinished')),
		ServerCommandRegistration: new Emitter<Server>(false, this.eventErrorBuilder('ServerCommandRegistration')),
		WorldLoaded: new Emitter<World>(false, this.eventErrorBuilder('WorldLoaded')),
		WorldUnloaded: new Emitter<World>(false, this.eventErrorBuilder('WorldUnloaded')),
	});

	readonly worlds: Map<string, World> = new Map();
	protected readonly generators: Map<string, WorldGenerator> = new Map();
	protected readonly _commandsInfo: Map<string, CommandInfo> = new Map();
	protected readonly _plugins: Map<string, Plugin> = new Map();
	protected _playerUUIDCache: Map<string, string> = new Map();

	readonly players: Map<string, Player> = new Map();

	readonly blocks = blocks;
	readonly blockIds = blockIds;
	readonly blockIdToName = blocksIdsToName;

	readonly groups: Map<string, Group> = new Map();

	readonly classicTextRegex = /[^ -~]/gi;

	config: IConfig = defaultConfig;

	readonly _takenPlayerIds: number[] = [];

	protected _autoSaveInterval = -1;
	protected _autoBackupInterval = -1;
	protected _worldTickInterval = -1;

	protected readonly _commandDispatcher = new CommandDispatcher<CommandSource>();


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
					this.groups.set(x, new Group(temp[x]));
				}
				this.logger.debug(`Loaded groups`);
			} else {
				this.groups.set('default', new Group({
					name: 'default',
					permissions: {
						'commands.spawn': true,
						'commands.main': true,
						'commands.maps': true,
						'commands.goto': true,
					},
				}));
				this.logger.debug(`Creating default group`);
			}

			if (this.files.existConfig('.uuidcache')) {
				this._playerUUIDCache = new Map(Object.entries(<Holder<string>>this.files.getConfig('.uuidcache')));
				this.logger.debug(`Loaded player cache`);
			} else {
				this._playerUUIDCache = new Map();
			}

			this.files.saveConfig('config', this.config);
			this.files.saveConfig('groups', this.groups);

			setupGenerators(this);
			this.logger.debug(`Default generators are setuped!`);

			if (!this.loadWorld(this.config.defaultWorldName)) {
				this.logger.log('Creating default world...');
				let lastPercent = -999;
				let lastText = '';
				await this.createWorld(this.config.defaultWorldName, [256, 128, 256], this.generators.get('island') ?? emptyGenerator, 0, null, (text, percent) => {
					if (lastText != text || Math.abs(lastPercent - percent) >= 10) {
						lastPercent = percent;
						lastText = text;
						this.logger.log(`&eGenerating ${this.config.defaultWorldName}&7: ${text} &8(${percent.toFixed()}%)`);
					}
				}); // fs
			}

			this.worlds.forEach((world) => {
				world.backup();
			});

			if (this.config.autoSaveInterval > 0) {
				this._autoSaveInterval = setInterval(() => {
					this.logger.debug(`Autosave started!`);
					const d = Date.now();
					this.worlds.forEach((world) => {
						this.saveWorld(world);
					});
					this.logger.debug(`Autosave ended! It took ${Date.now() - d} ms!`);
				}, 1000 * 60 * this.config.autoSaveInterval);
			}
			if (this.config.backupInterval > 0) {
				this._autoBackupInterval = setInterval(() => {
					this.logger.debug(`Backup started!`);
					const d = Date.now();
					this.worlds.forEach((world) => {
						world.backup();
					});
					this.logger.debug(`Backup ended! It took ${Date.now() - d} ms!`);
				}, 1000 * 60 * this.config.backupInterval);
			}

			setupCommands(this, this._commandsInfo);
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
				return;
			}

			this.event.ServerCommandRegistration._emit(this);

			this.files.listWorlds().forEach((x) => this.loadWorld(x));

			try {
				this._startListening();
			} catch (e) {
				this.logger.error(e);
				this.stopServer();
				return;
			}

			this._loaded = true;
			this.event.ServerLoadingFinished._emit(this);

			let tick = 0n;
			this._worldTickInterval = setInterval(() => {
				for (const [,world] of this.worlds) {
					world._tick(tick)
				}

				for (const [,player] of this.players) {
					player._connectionHandler.tick()
				}

				tick++;
			}, 1000 / 20);

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
		try {
			clearInterval(this._worldTickInterval);
			clearInterval(this._autoBackupInterval);
			clearInterval(this._autoSaveInterval);
		} catch (e) {
			this.logger.warn("Couldn't clear intervals!");
			this.logger.warn(e);
		}

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
	 * Adds player (can be virtual!) to server.
	 *
	 * @param auth auth information about player
	 * @param conn Main connection handler, used for handling packets
	 */
	async addPlayer(auth: AuthData, conn: ConnectionHandler) {
		if (this.players.get(auth.uuid ?? 'offline-' + auth.username.toLowerCase())) {
			conn.disconnect('Player with this username is already in game!');
			return;
		}
	
		const authProvider = auth.authProvider ? `/${auth.authProvider}` : '';
		this.logger.conn(
			auth.service == 'Unknown'
				? `User ${auth.username} (${auth.uuid}) doesn't use any auth...`
				: `User ${auth.username} (${auth.uuid}) is logged with ${auth.service} (${authProvider}) auth!`
		);
	
		const player = new Player(
			auth.uuid ?? 'offline-' + auth.username.toLowerCase(),
			auth.username,
			conn.getClient() ?? 'Classic',
			auth.service,
	
			conn,
			this
		);
		this.players.set(player.uuid, player);
	
		this._playerUUIDCache.set(player.username.toLowerCase(), player.uuid);
	
		{
			const result = this.event.PlayerConnect._emit({ player });
	
			if (!result.continue) {
				return;
			}
		}
	
		await player._connectionHandler.sendWorld(player.world);
		player.world._addPlayer(player);
		player.isInWorld = true;
		this.sendChatMessage(this.getMessage('join', { player: player.getDisplayName() }), player);
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
	executeConsoleCommand(command: string): number {
		return this.executeCommand(command, { 
			server: this, 
			player: () => { throw ErrorTypes.playerRequired.create() },
			playerOrNull: () => null,
			send: this.logger.log, 
			checkPermission: (_x: string) => TriState.TRUE,
			sendError: this.logger.error
		 });
	}

	/**
	 * Executes command
	 *
	 * @param command Used command, without / symbol
	 * @returns If command was executed
	 */
	executeCommand(command: string, source: CommandSource): number {
		try {
			return this._commandDispatcher.execute(command, source);
		} catch (e: unknown) {
			if (e != null && typeof e == 'object' && 'value' in e) {
				// deno-lint-ignore no-ex-assign
				e = (<{value: unknown}>e).value;

			}

			if (e instanceof CommandSyntaxError) {
				source.sendError(e.message)
			} else {
				source.sendError("Internal error occured while executing this command! See logs for details");				

				if (e instanceof Error) {
					this.logger.error("=============")
					this.logger.error(e.name)
					this.logger.error(e.message)
					if (e.stack) {
						this.logger.error("")
						this.logger.error("Stack:")
						this.logger.error(e.stack)
					}
					this.logger.error("=============")
				}
			}
			return -1;
		}
	}

	/**
	 * Sends a chat message to everyone on server (including console)
	 *
	 * @param message Formatted message
	 * @param player Player that send it, don't need to be set
	 */
	sendChatMessage(message: string, player?: Player) {
		for (const [, p] of this.players) {
			p.sendMessage(message, player);
		}

		this.logger.chat(message);
	}

	/**
	 * Saves passed world instance
	 *
	 * @param world World instance
	 * @returns If saving was successful
	 */
	saveWorld(world: World): boolean {
		return this.files.saveWorld(world.fileName, world);
	}

	/**
	 * Loads world by name
	 *
	 * @param name World name
	 * @returns World instance or null (if doesn't exist)
	 */
	loadWorld(fileName: string): Nullable<World> {
		try {
			if (this.worlds.has(fileName)) {
				return this.worlds.get(fileName) ?? null;
			} else {
				const data = this.files.getWorld(fileName);

				if (data != null) {
					const world = new World(fileName, data, this);
					this.worlds.set(fileName, world);
					this.event.WorldLoaded._emit(world);
					return world;
				}
				return null;
			}
		} catch (e) {
			this.logger.error(`Couldn't load world ${fileName}!`);
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
		} else if (!this.worlds.has(name)) {
			return true;
		} else if (save) {
			const world = this.worlds.get(name);
			const defaultWorld = this.worlds.get(this.config.defaultWorldName);

			if (world == undefined || defaultWorld == null) throw "World doesn't exist!?";

			world.teleportAllPlayers(defaultWorld);
			const x = this.saveWorld(world);
			if (x) {
				this.worlds.delete(name);
				this.event.WorldUnloaded._emit(world);
			}
			
			return x;
		} else {
			const world = this.worlds.get(name);
			if (world != null) {
				this.event.WorldUnloaded._emit(world);
			}
			this.worlds.delete(name);
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
	async createWorld(name: string, size: XYZ, generator: WorldGenerator, seed?: number, player?: Nullable<Player>, listener? : GenerationStatusListener): Promise<Nullable<World>> {
		try {
			if (this.worlds.has(name)) {
				listener?.('Already exists!', 100)
				return this.worlds.get(name) ?? null;
			}
			listener?.('Starting generation', 0)

			const view = await generator.generate(size[0], size[1], size[2], seed, listener);
			listener?.('World generated', 100)

			const world = new World(
				name.toLowerCase().replace(' ', '_'),
				{
					name,
					size,
					generator: { software: generator.software, type: generator.name },
					createdBy: {
						service: player?.service ?? 'Unknown',
						username: player?.username ?? `${this.softwareName} - ${generator.name}`,
						uuid: player?.uuid ?? 'Unknown',
					},
					spawnPoint: view.getSpawnPoint(),
					physics: PhysicsLevel.FULL,
					blockData: view.getRawBlockData(),
				},
				this
			);

			this.worlds.set(world.fileName, world);
			listener?.('Saving', 0)
			this.saveWorld(world);
			listener?.('Saving', 100)

			return world;
		} catch (e) {
			listener?.('Error!', -1)

			this.logger.error(
				`Couldn't create world ${name} (size: ${size}, generator: ${generator?.name}, seed: ${seed ?? 0}, player: ${player?.username ?? null})!`
			);
			this.logger.error(e);
			return null;
		}
	}

	/**
	 * Deletes world by it's name
	 *
	 * @param name World's name
	 */
	deleteWorld(name: string): boolean {
		if (this.config.defaultWorldName == name) {
			return false;
		} else {
			const x = this.unloadWorld(name, false);

			if (this.files.existWorld(name)) {
				return this.files.deleteWorld(name);
			}

			return x;
		}
	}

	/**
	 * Gets loaded world
	 * 
	 * @param name World's name
	 * @returns World or null
	 */
	getWorld(name: string): Nullable<World> {
		return this.worlds.get(name) ?? null;
	}


	/**
	 * Returns default world
	 */
	getDefaultWorld(): World {
		const defaultWorld = this.worlds.get(this.config.defaultWorldName);
		if (defaultWorld == null) {
			throw "Default world isn't loaded!";
		}
		return defaultWorld;
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
			const api = Semver.valid(plugin.cobblestoneApi);
			if (api != null) {
				if (Semver.gte(api, this._minimalApiVersion)) {
					if (Semver.lte(api, this.softwareVersion)) {
						this.logger.log(`Initializing plugin ${plugin.name} ${plugin.version}`);

						await plugin.init(this);

						const newPlugin = {
							...plugin,
							name: plugin.name ?? plugin.id,
							init: (_x: Server) => null,
						};

						this._plugins.set(plugin.id, newPlugin);

						return newPlugin;
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
		return this._plugins.get(plugin) ?? null;
	}

	/**
	 * Adds new command
	 *
	 * @param command Command instance
	 * @returns Boolean indicating, if it was successful
	 */
	addCommand(literal: LiteralArgumentBuilder<CommandSource>, description?: string, helpPages?: HelpPage[]): boolean {
		const node = this._commandDispatcher.register(literal);

		this._commandsInfo.set(node.getName(), {
			name: node.getName(),
			node: node,
			description: description ?? "Command",
			help: helpPages,
		});

		this.logger.debug(`Command ${node.getName()} added`);

		return true;
	}

	/**
	 * Removes command
	 *
	 * @param command Command name
	 * @returns Boolean indicating, if it was successful
	 * /
	removeCommand(command: string): boolean {
		
		this._commandDispatcher.getRoot().getChildren()
		this._commandsInfo.delete(command);
		return false;
	}*/

	/**
	 * Returns command dispatcher
	 */
	getCommandDispatcher(): CommandDispatcher<CommandSource> {
		return this._commandDispatcher;
	}

	/**
	 * Adds new generator to list of generators
	 *
	 * @param gen Generator instance
	 * @returns Boolean indicating, if operation was successful
	 */
	addGenerator(gen: WorldGenerator): boolean {
		this.generators.set(gen.name, gen);
		this.logger.debug(`Generator ${gen.name} added`);

		return true;
	}

	/**
	 * Allows to get generator by name
	 *
	 * @param gen Generators name
	 * @returns WorldGenerator or null
	 */
	getGenerator(gen: string): WorldGenerator {
		return this.generators.get(gen) ?? emptyGenerator;
	}

	/**
	 * Returns all generators (readonly)
	 */
	getAllGenerators(): Map<string, WorldGenerator> {
		return this.generators;
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
		return this._playerUUIDCache.get(username.toLowerCase()) ?? null;
	}

	getPlayerByName(username: string): Nullable<Player> {
		return this.players.get(this._playerUUIDCache.get(username.toLowerCase()) ?? "") ?? null;
	}


	getPlayerHolderByName(username: string): Nullable<VirtualPlayerHolder> {
		const uuid = this.getPlayerIdFromName(username);
		if (!uuid) return null;
		return new VirtualPlayerHolder(uuid, this);
	}

	/**
	 * Gets free numeric id, that can be used for player.
	 */
	getFreePlayerId(): number {
		for (let x = 0; x < 127; x++) {
			let free = true;
			for (const [, p] of this.players) {
				if (p.numId == x) {
					free = false;
					break;
				}
			}

			if (free) {
				return x;
			}
		}

		return -1;
	}

	/**
	 * Converts block id to Block instance
	 *
	 * @param id Block id
	 * @returns Block or null if invalid
	 */
	static getBlock(id: number): Nullable<Block> {
		return (<Holder<Block>>blocks)[blocksIdsToName[id]] ?? null;
	}

	getBlock = Server.getBlock;

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
	displayName?: string;
	prefix?: string;
	suffix?: string;
	permissions: { [i: string]: Nullable<boolean> };

	constructor(data: GroupInterface) {
		this.name = data.name;
		this.displayName = data.displayName;
		this.prefix = data.prefix;
		this.suffix = data.suffix;
		this.permissions = data.permissions;
	}

	getName() {
		return this.displayName ?? this.name;
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
	critical(text: string): void;
	warn(text: string): void;
	chat(text: string): void;
	conn(text: string): void;
	debug(test: string): void;

	storedToFile: boolean;
	showDebug: boolean;
}

export interface IFileHelper {
	saveConfig(namespace: string, config: unknown): boolean;
	deleteConfig(namespace: string, config: unknown): boolean;
	getConfig(namespace: string): Nullable<unknown>;
	existConfig(namespace: string): boolean;

	saveWorld(name: string, world: World): boolean;
	deleteWorld(name: string): boolean;
	getWorld(namespace: string): Nullable<WorldData>;
	existWorld(name: string): boolean;
	listWorlds(): string[];

	savePlayer(uuid: string, player: PlayerData): boolean;
	deletePlayer(uuid: string): boolean;
	getPlayer(uuid: string): Nullable<PlayerData>;
	existPlayer(uuid: string): boolean;
	listPlayers(): string[];
}

const defaultConfig = {
	address: 'localhost',
	port: 25565,

	serverName: 'Cobblestone',
	serverMotd: 'Another Minecraft Classic server!',

	maxPlayerCount: 20,
	autoSaveInterval: 5,
	backupInterval: 1440,

	defaultWorldName: 'main',

	onlineMode: true,

	useBetaCraftHeartbeat: false,
	publicOnBetaCraft: false,

	useClassiCubeHeartbeat: false,
	publicOnClassiCube: false,

	allowOffline: true,

	enableModernMCProtocol: true,

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
	} as {[i: string]: string},
};

export type IConfig = typeof defaultConfig;