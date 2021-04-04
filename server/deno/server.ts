import { TpcConnectionHandler, VoxelSrvConnectionHandler } from './networking/connection.ts';
import { PlayerData } from '../core/player.ts';
import { IFileHelper, ILogger, Server } from '../core/server.ts';
import { World } from '../core/world/world.ts';
import { fs, createHash, wss, serve, serveTLS } from './deps.ts';
import { gzip, ungzip, uuid } from '../core/deps.ts';
import { AuthData, Nullable, SubServices } from '../core/types.ts';

const textEncoder = new TextEncoder();

export class DenoServer extends Server {
	//protected _saltMineOnline: string;
	protected _saltBetaCraft: string;
	_serverIcon: string | undefined;
	protected _shouldLoadPlugins: boolean;

	constructor(loadPlugins = true, devMode = false) {
		super(fileHelper, logger, devMode);
		this._shouldLoadPlugins = loadPlugins;
		/*{
			const hash = createHash('md5');
			hash.update(<string>uuid.v4());
			this._saltMineOnline = hash.toString();
		}*/
		{
			const hash = createHash('md5');
			hash.update(<string>uuid.v4());
			this._saltBetaCraft = hash.toString();
		}
	}

	async _startServer() {
		['world', 'player', 'config', 'world/backup', 'logs', 'plugins'].forEach((x) => {
			if (!fs.existsSync(`./${x}`)) {
				Deno.mkdirSync(`./${x}`);
			}
		});

		await super._startServer();
	}

	protected _startListening() {
		try {
			if (fs.existsSync('./config/server-icon.png')) {
				const file = Deno.readFileSync('./config/server-icon.png');

				this._serverIcon = btoa(String.fromCharCode.apply(null, [...file]));
			}
		} catch (e) {
			this.logger.error('Server icon (server-icon.png) is invalid!');
		}

		const listener = Deno.listen({ port: this.config.port });

		(async () => {
			for await (const conn of listener) {
				if (this.isShuttingDown) {
					return;
				}
				new TpcConnectionHandler(conn, this, (s) => {
					this.connectPlayer(s);
				});
			}
		})();

		this.logger.log(`&aListenning to connections on port ${this.config.port}`);

		if (this.config.voxelSrvPort > 0) {
			const wsserver = this.config.VoxelSrvUseWSS
				? serveTLS({ port: this.config.voxelSrvPort, certFile: this.config.VoxelSrvWssOptions.cert, keyFile: this.config.VoxelSrvWssOptions.key })
				: serve({ port: this.config.voxelSrvPort });

			(async () => {
				for await (const req of wsserver) {
					if (this.isShuttingDown) {
						return;
					}

					const { conn, r: bufReader, w: bufWriter, headers } = req;
					wss
						.acceptWebSocket({
							conn,
							bufReader,
							bufWriter,
							headers,
						})
						.then((ws) => {
							const x = new VoxelSrvConnectionHandler(ws, this);
							x._connect = (y) => this.connectPlayer(x, 'VoxelSrv', y ?? undefined);
							x._authenticate(this);
						})
						.catch(async (err) => {
							await req.respond({ status: 400 });
						});
				}
			})();

			this.logger.log(`&aListenning to VoxelSrv connections on port ${this.config.voxelSrvPort}`);
		}

		(async () => {
			for await (const _ of Deno.signal(Deno.Signal.SIGINT)) {
				if (this.isShuttingDown) {
					return;
				}

				this.stopServer();

				setTimeout(() => Deno.exit(), 500);
			}
		})();

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
				if (!this.executeCommand(command)) {
					this.logger.log("&cThis command doesn't exist");
				}
			}
		})();

		const f = () => {
			const players: string[] = [];
			Object.values(this.players).forEach((p) => players.push(p.username));

			/*try {
				if (this.config.publicOnMineOnline) {
					const obj = {
						name: this.config.serverName,
						ip: this.config.address,
						port: this.config.port,
						onlinemode: this.config.classicOnlineMode,
						'verify-names': this.config.classicOnlineMode,
						md5: '90632803F45C15164587256A08C0ECB4',
						whitelisted: false,
						max: this.config.maxPlayerCount,
						motd: this.config.serverMotd,
						serverIcon: this._serverIcon,
						players,
					};

					fetch('https://mineonline.codie.gg/api/servers', {
						method: 'POST',
						body: JSON.stringify(obj),
						headers: { 'Content-Type': 'application/json' },
					});
				}

				if (this.config.useMineOnlineHeartbeat) {
					fetch(
						`https://mineonline.codie.gg/heartbeat.jsp?port=${this.config.port}&max=${this.config.maxPlayerCount}&name=${escape(
							this.config.serverName
						)}&public=${this.config.publicOnMineOnline ? 'True' : 'False'}&version=7&salt=${this._saltMineOnline}&users=${players.length}`
					);
				}
			} catch (e) {
				this.logger.warn(`Couldn't send heartbeat to MineOnline!`);
			}*/

			try {
				if (this.config.useBetaCraftHeartbeat) {
					fetch(
						`https://betacraft.pl/heartbeat.jsp?port=${this.config.port}&max=${this.config.maxPlayerCount}&name=${escape(
							this.config.serverName
						)}&public=${this.config.publicOnBetaCraft ? 'True' : 'False'}&version=7&salt=${this._saltBetaCraft}&users=${players.length}`
					);
				}
			} catch (e) {
				this.logger.warn(`Couldn't send heartbeat to BetaCraft!`);
			}

			try {
				if (this.config.publicOnVoxelSrv) {
					const address = (this.config.VoxelSrvUseWSS ? 'wss://' : 'ws://') + `${this.config.address}:${this.config.voxelSrvPort}`;

					fetch(`https://voxelsrv.pb4.eu/api/addServer?ip=${address}&type=1`);
				}
			} catch (e) {
				this.logger.warn(`Couldn't send heartbeat to VoxelSrv!`);
			}
		};

		setTimeout(f, 2000);
		setInterval(f, 1000 * 60);
	}

	stopServer() {
		super.stopServer();

		setTimeout(() => Deno.exit(), 4000);
	}

	async authenticatePlayer(data: AuthData): Promise<{ auth: AuthData; allow: boolean }> {
		if (data.authenticated) {
			return { allow: true, auth: { ...data, username: `#${data.username}` } };
		}

		if (this.config.classicOnlineMode) {
			let subService: Nullable<SubServices> = null;
			/*const hash = createHash('md5');
			hash.update(this._saltMineOnline + data.username);

			if (hash.toString() == data.secret) {
				subService = 'MineOnline';
			} else {*/
				const hash = createHash('md5');
				hash.update(this._saltBetaCraft + data.username);
				if (hash.toString() == data.secret) {
					subService = 'Betacraft';
				}
			//}

			if (subService != null) {
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
							subService: subService,
						},
					};
				}
			}
		}

		if (this.config.allowOffline || !this.config.classicOnlineMode) {
			return {
				auth: {
					username: this.config.classicOnlineMode ? `*${data.username}` : data.username,
					uuid: 'offline-' + data.username.toLowerCase(),
					secret: null,
					service: 'Unknown',
					authenticated: true,
					subService: null,
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

export const logger: ILogger & { writeToLog: (t: string) => void; file?: Deno.File; openedAt?: number } = {
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
			logger.openedAt = day;
			const base = Server.formatDate(date, false);
			let name = base;
			let n = 1;

			while (fs.existsSync(`./logs/${name}.log`)) {
				name = `${base}-${n}`;
				n = n + 1;
			}

			logger.file = Deno.openSync(`./logs/${name}.log`, { write: true, read: true, create: true });
		}

		logger.file.writeSync(textEncoder.encode(clean + '\n'));
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

	saveWorld(name: string, world: World) {
		try {
			const file = Deno.createSync(`./world/${name}.cw`);

			const compressed = gzip(world.serialize());

			if (compressed != undefined) {
				file.writeSync(compressed);

				file.close();
				return true;
			}
			return false;
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

			const uncompressed = ungzip(file);

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
			const file = Deno.createSync(`./player/${uuid}.json`);

			file.writeSync(textEncoder.encode(JSON.stringify(player)));

			file.close();
			return true;
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	getPlayer(uuid: string) {
		try {
			if (!fs.existsSync(`./player/${uuid}.json`)) {
				return null;
			}

			const file = Deno.readTextFileSync(`./player/${uuid}.json`);
			return JSON.parse(file);
		} catch (e) {
			logger.error(e);
			return null;
		}
	},

	existPlayer(uuid: string) {
		try {
			return fs.existsSync(`./player/${uuid}.cw`);
		} catch (e) {
			logger.error(e);
			return false;
		}
	},

	listPlayers() {
		try {
			const out: string[] = [];

			for (const dirEntry of Deno.readDirSync('./player/')) {
				if (dirEntry.isFile && dirEntry.name.endsWith('.json')) {
					out.push(dirEntry.name.substr(0, dirEntry.name.length - 5));
				}
			}

			return out;
		} catch (e) {
			logger.error(e);
			return [];
		}
	},
};
