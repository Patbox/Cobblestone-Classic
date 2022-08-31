import { TpcConnectionHandler } from './networking/connection.ts';
import { Player, PlayerData } from '../core/player.ts';
import { IFileHelper, ILogger, Server } from '../core/server.ts';
import { World } from '../core/world/world.ts';
import { fs, crypto2 } from './deps.ts';
import { Msgpack, Semver, Denoflate, Hex } from '../core/deps.ts';
import { AuthData, AuthProvider, Nullable, Services } from '../core/types.ts';

const textEncoder = new TextEncoder();

export const defaultFolders = ['world', 'player', 'config', 'logs', 'plugins'];

export class DenoServer extends Server {
	protected _salt = <Record<AuthProvider, string>>{};
	_serverIcon: string | undefined;
	_classiCubeWebAddress: Nullable<string> = null;

	protected _shouldLoadPlugins: boolean;

	static readonly denoVersion = '1.25.x';
	static readonly denoVersionMin = '1.25.0';
	static readonly denoVersionMax = '1.26.0';

	constructor(loadPlugins = true, devMode = false) {
		super(fileHelper, logger, devMode);
		this._shouldLoadPlugins = loadPlugins;
		this._salt['Betacraft'] = crypto.randomUUID().replaceAll('-', '');
		this._salt['ClassiCube'] = crypto.randomUUID().replaceAll('-', '');
	}

	async _startServer() {
		if (!Semver.satisfies(Deno.version.deno, '>=' + DenoServer.denoVersionMin + ' <' + DenoServer.denoVersionMax)) {
			this.logger.warn(
				`Your Deno version is unsupported! This software was developed agains ${DenoServer.denoVersion}, while you are using ${Deno.version.deno}!`
			);
		}

		[...defaultFolders, 'world/backup'].forEach((x) => {
			fs.ensureDirSync(`./${x}`);
		});

		await super._startServer();
	}

	protected _startListening() {
		try {
			const file = Deno.readFileSync('./config/server-icon.png');

			if (file != null) {
				this._serverIcon = btoa(String.fromCharCode.apply(null, [...file]));
			}
		} catch (_e) {
			this.logger.warn("Server icon (server-icon.png) is invalid or doesn't exist!");
		}

		const listener = Deno.listen({ port: this.config.port });

		(async () => {
			for await (const conn of listener) {
				if (this.isShuttingDown) {
					return;
				}

				new TpcConnectionHandler(conn, this);
			}
		})();

		this.logger.log(`&aListenning to connections on port ${this.config.port}`);

		try {
			Deno.addSignalListener('SIGTERM', () => {
				if (this.isShuttingDown) {
					return;
				}

				this.stopServer();

				setTimeout(() => Deno.exit(), 500);
			});
		} catch (_e) {
			//noop
		}

		(async () => {
			const buf = new Uint8Array(1024);

			for (;;) {
				const n = (await Deno.stdin.read(buf)) ?? 0;
				if (this.isShuttingDown) {
					return;
				}
				const command = String.fromCharCode(...buf.slice(0, n)).replace('\n', '');
				buf.fill(0);
				logger.writeToLog('> ' + command);
				this.executeConsoleCommand(command);
			}
		})();

		const heartBeat = () => {
			const players: string[] = [];
			Object.values(this.players).forEach((p) => players.push((<Player>p).username));

			try {
				if (this.config.useBetaCraftHeartbeat) {
					fetch(
						`https://betacraft.uk/heartbeat.jsp?port=${this.config.port}&max=${this.config.maxPlayerCount}&name=${encodeURIComponent(
							this.config.serverName
						)}&public=${this.config.publicOnBetaCraft ? 'True' : 'False'}&version=7&salt=${this._salt['Betacraft']}&users=${players.length}`
					);
				}
			} catch (_e) {
				this.logger.warn(`Couldn't send heartbeat to BetaCraft!`);
			}

			try {
				if (this.config.useClassiCubeHeartbeat) {
					fetch(
						`http://www.classicube.net/server/heartbeat/?` +
							`&port=${this.config.port}` +
							`&max=${this.config.maxPlayerCount}` +
							`&name=${encodeURIComponent(this.config.serverName)}` +
							`&public=${this.config.publicOnClassiCube}` +
							`&version=7` +
							`&salt=${this._salt['ClassiCube']}` +
							`&users=${this.players.size}` +
							`&software=${encodeURIComponent(Server.softwareName)}` +
							`&web=true`
					).then(async (data) => {
						const out = await data.text();
						if (out.startsWith('http')) {
							this._classiCubeWebAddress = out;
						}
					});
				}
			} catch (_e) {
				this.logger.warn(`Couldn't send heartbeat to ClassiCube!`);
			}
		};

		setTimeout(heartBeat, 2000);
		setInterval(heartBeat, 1000 * 60);
	}

	async stopServer() {
		await super.stopServer();

		this.stopDeno();
	}

	protected stopDeno() {
		setTimeout(() => Deno.exit(), 4000);
	}

	async authenticatePlayer(data: AuthData): Promise<{ auth: AuthData; allow: boolean }> {
		if (data.authenticated) {
			return { allow: true, auth: data };
		}

		if (this.config.onlineMode) {
			const encoder = new TextEncoder();
			const decoder = new TextDecoder();
			let service: Nullable<Services> = null;
			let authProvider: AuthProvider = 'None';

			const classicCheck = async (provider: AuthProvider) => {
				return decoder.decode(Hex.encode(new Uint8Array(await crypto2.subtle.digest('MD5', encoder.encode(this._salt[provider] + data.username))))) == data.secret;
			};

			if (await classicCheck('Betacraft')) {
				service = 'Minecraft';
				authProvider = 'Betacraft';
			} else if (await classicCheck('ClassiCube')) {
				service = 'ClassiCube';
				authProvider = 'ClassiCube';
			}

			if (service == 'Minecraft') {
				const moj: { id: string; name: string; error?: string } = await (
					await fetch('https://api.mojang.com/users/profiles/minecraft/' + data.username)
				).json();

				if (moj.error == undefined) {
					return {
						allow: true,
						auth: {
							uuid: 'minecraft-' + moj.id,
							username: moj.name,
							service: 'Minecraft',
							secret: null,
							authenticated: true,
							authProvider: authProvider,
						},
					};
				}
			} else if (service != null) {
				return {
					allow: true,
					auth: {
						uuid: authProvider.toLowerCase() + '-' + data.username,
						username: data.username,
						service: service,
						secret: null,
						authenticated: true,
						authProvider: authProvider,
					},
				};
			}
		}

		if (this.config.allowOffline || !this.config.onlineMode) {
			return {
				auth: {
					username: this.config.onlineMode ? `*${data.username}` : data.username,
					uuid: 'offline-' + data.username.toLowerCase(),
					secret: null,
					service: 'Unknown',
					authenticated: true,
					authProvider: 'None',
				},
				allow: true,
			};
		}
		return { auth: data, allow: false };
	}

	protected async _startLoadingPlugins() {
		if (this._loaded || !this._shouldLoadPlugins) return;
		for (const dirEntry of Deno.readDirSync('./plugins/')) {
			if (dirEntry.isFile && (dirEntry.name.endsWith('.ts') || dirEntry.name.endsWith('.ts'))) {
				const plugin = await import(Deno.cwd() + `/plugins/${dirEntry.name}`);
				this.addPlugin(plugin, dirEntry.name);
			}
		}
	}
}

const colorsTag = /&[0-9a-fl-or]/gi;

export const logger: ILogger & { writeToLog: (t: string) => void; reopenFile: () => void; file?: Deno.FsFile; openedAt?: number } = {
	log: (text: string) => {
		const out = `&8[&f${hourNow()}&8] &f${text}`;

		console.log(colorToTerminal(out));
		logger.writeToLog(out);
	},
	error: (text: string) => {
		const out = `&8[&f${hourNow()} &4Error&8] &c${text}`;

		console.log(colorToTerminal(out));
		logger.writeToLog(out);
	},
	critical: (text: string) => {
		const out = `&8[&f${hourNow()} &4Critical!&8] &4${text}`;

		console.log(colorToTerminal(out));
		logger.writeToLog(out);
	},
	warn: (text: string) => {
		const out = `&8[&f${hourNow()} &6Warn&8] &6${text}`;

		console.log(colorToTerminal(out));
		logger.writeToLog(out);
	},
	chat: (text: string) => {
		const out = `&8[&f${hourNow()}&e Chat&8] &e${text}`;

		console.log(colorToTerminal(out));
		logger.writeToLog(out);
	},

	conn: (text: string) => {
		const out = `&8[&f${hourNow()} &aConn&8] &b${text}`;

		console.log(colorToTerminal(out));
		logger.writeToLog(out);
	},

	debug: (text: string) => {
		if (logger.showDebug) {
			const out = `&8[&f${hourNow()}&2 Debug&8] &7${text}`;

			console.log(colorToTerminal(out));
			logger.writeToLog(out);
		}
	},

	storedToFile: true,
	showDebug: false,

	writeToLog: (t: string) => {
		const clean = t.replaceAll(colorsTag, '');
		const date = new Date();
		const day = date.getDay();

		if (logger.openedAt != day || logger.file == undefined) {
			logger.reopenFile();
		}

		logger.file?.writeSync(textEncoder.encode(clean + '\n'));
	},

	reopenFile: () => {
		const date = new Date();
		logger.openedAt = date.getDay();
		logger.file?.close();
		const base = Server.formatDate(date, false);
		let name = base;
		let n = 1;

		while (fs.existsSync(`./logs/${name}.log`)) {
			name = `${base}-${n}`;
			n = n + 1;
		}

		fs.ensureDirSync('./logs');
		logger.file = Deno.openSync(`./logs/${name}.log`, { write: true, read: true, create: true });
	},
};

const colorMap: Record<string, string> = {
	'0': '30',
	'1': '34',
	'2': '32',
	'3': '36',
	'4': '31',
	'5': '35',
	'6': '33',
	'7': '37',
	'8': '90',
	'9': '94',
	a: '92',
	b: '96',
	c: '91',
	d: '95',
	e: '93',
	f: '97',
	r: '0',
	l: '1',
	m: '9',
	n: '4',
	o: '3',
};

function colorToTerminal(text: string) {
	return Deno.noColor ? text.replaceAll(colorsTag, '') : text.replaceAll(colorsTag, (x) => `\x1b[39;${colorMap[x[1]]}m`) + '\x1b[0m';
}

function hourNow(): string {
	const date = new Date();
	const hour = date.getHours().toString();
	const minutes = date.getMinutes().toString();
	const seconds = date.getSeconds().toString();

	return (
		(hour.length == 2 ? hour : '0' + hour) +
		':' +
		(minutes.length == 2 ? minutes : '0' + minutes) +
		':' +
		(seconds.length == 2 ? seconds : '0' + seconds)
	);
}

const fileHelper: IFileHelper = {
	saveConfig(namespace: string, config: Record<string, unknown>) {
		try {
			const file = Deno.createSync(`./config/${namespace}.json`);

			file.writeSync(textEncoder.encode(JSON.stringify(config, null, 2)));

			file.close();
			return true;
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	deleteConfig(namespace: string) {
		try {
			if (this.existConfig(namespace)) {
				Deno.removeSync(`./config/${namespace}.json`);
			}
			return true;
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	getConfig(namespace: string) {
		try {
			if (!fs.existsSync(`./config/${namespace}.json`)) {
				return {};
			}

			const file = Deno.readTextFileSync(`./config/${namespace}.json`);
			return JSON.parse(file);
		} catch (e) {
			logger.error(e);
			return {};
		}
	},

	existConfig(namespace: string) {
		try {
			return fs.existsSync(`./config/${namespace}.json`);
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	async saveWorld(name: string, world: World) {
		try {
			const file = await Deno.create(`./world/${name}.cw`);

			const compressed = Denoflate.gzip(world.serialize(), 8);

			if (compressed != undefined) {
				await file.write(compressed);

				file.close();
				return true;
			}
			return false;
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	deleteWorld(name: string) {
		try {
			if (this.existWorld(name)) {
				Deno.removeSync(`./world/${name}.cw`);
			}
			return true;
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	getWorld(name: string) {
		try {
			if (!fs.existsSync(`./world/${name}.cw`)) {
				return null;
			}

			const file = Deno.readFileSync(`./world/${name}.cw`);

			const uncompressed = Denoflate.gunzip(file);

			if (uncompressed != null && uncompressed instanceof Uint8Array) {
				return World.deserialize(uncompressed);
			} else {
				return null;
			}
		} catch (e) {
			logger.error(e);
			return null;
		}
	},

	existWorld(name: string) {
		try {
			return fs.existsSync(`./world/${name}.cw`);
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	listWorlds(): string[] {
		try {
			const out: string[] = [];

			for (const dirEntry of Deno.readDirSync('./world/')) {
				if (dirEntry.isFile && dirEntry.name.endsWith('.cw')) {
					out.push(dirEntry.name.substr(0, dirEntry.name.length - 3));
				}
			}

			return out;
		} catch (e) {
			logger.error(e);
			return [];
		}
	},

	savePlayer(uuid: string, player: PlayerData) {
		try {
			const file = Deno.createSync(`./player/${uuid}.cpd`);

			file.writeSync(Msgpack.encode(player));

			file.close();
			return true;
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	deletePlayer(uuid: string) {
		try {
			if (this.existPlayer(uuid)) {
				Deno.removeSync(`./player/${uuid}.cpd`);
			}
			return true;
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	getPlayer(uuid: string) {
		try {
			if (!fs.existsSync(`./player/${uuid}.cpd`)) {
				return null;
			}

			const file = Deno.readFileSync(`./player/${uuid}.cpd`);
			return <PlayerData>Msgpack.decode(file);
		} catch (e) {
			logger.error(e);
			return null;
		}
	},

	existPlayer(uuid: string) {
		try {
			return fs.existsSync(`./player/${uuid}.cpd`);
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	listPlayers() {
		try {
			const out: string[] = [];

			for (const dirEntry of Deno.readDirSync('./player/')) {
				if (dirEntry.isFile && dirEntry.name.endsWith('.cpd')) {
					out.push(dirEntry.name.slice(0, dirEntry.name.length - 5));
				}
			}

			return out;
		} catch (e) {
			logger.error(e);
			return [];
		}
	},
};
