import { TpcConnectionHandler } from '../native/networking/connection.ts';
import { PlayerData } from '../core/player.ts';
import { IFileHelper, ILogger, Server } from '../core/server.ts';
import { World } from '../core/world.ts';
import { fs, colors, createHash } from './deps.ts';
import { gzip, ungzip, uuid } from '../core/deps.ts';
import { AuthData } from '../core/types.ts';

const textEncoder = new TextEncoder();

export class NativeServer extends Server {
	_salt: string;

	constructor() {
		super(fileHelper, logger);
		this._salt = <string>uuid.v4();
	}

	startListening() {
		const listener = Deno.listen({ port: this.config.port });

		(async () => {
			for await (const conn of listener) {
				const x = new TpcConnectionHandler(conn);
				this.connectPlayer(x);
			}
		})();

		let isStopping = false;

		(async () => {
			for await (const _ of Deno.signal(Deno.Signal.SIGINT)) {
				if (isStopping) {
					return;
				}

				isStopping = true;

				this.stopServer();

				setTimeout(() => Deno.exit(), 500);
			}
		})();

		const f = () => {
			const players: string[] = [];
			Object.values(this.players).forEach((p) => players.push(p.username));

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
					//"serverIcon": "(optional, base 64 string)"
					players,
				};

				fetch('https://mineonline.codie.gg/api/servers', {
					method: 'POST',
					body: JSON.stringify(obj),
					headers: { 'Content-Type': 'application/json' },
				}) ;
			}

			if (this.config.useMineOnlineHeartbeat) {
				fetch(
					`https://mineonline.codie.gg/heartbeat.jsp?port=${this.config.port}&max=${this.config.maxPlayerCount}&name=${escape(
						this.config.serverName
					)}&public=${this.config.publicOnMineOnline}&version=7&salt=${this._salt}`
				);
			}
		};

		f();
		setInterval(f, 1000 * 60);

		this.logger.log(`&aListenning to connections on port ${this.config.port}`);
	}

	stopServer() {
		super.stopServer();
		console.log('\x1b[0m');

	}

	async authenticatePlayer(data: AuthData): Promise<{ auth: AuthData; allow: boolean }> {
		if (data.service == 'Minecraft') {
			const hash = createHash('md5');
			hash.update(this._salt + data.username);
			const hashInHex = hash.toString();

			if (hashInHex == data.secret) {
				const moj: { id: string; username: string; error?: string } = await (
					await fetch('https://api.mojang.com/users/profiles/minecraft/' + data.username)
				).json();

				if (moj.error == undefined) {
					return {
						allow: true,
						auth: {
							uuid: 'minecraft-' + moj.id,
							username: moj.username,
							service: 'Minecraft',
							secret: null,
							authenticated: true,
						},
					};
				}
			}
		}

		if (this.config.allowOffline) {
			return {
				auth: {
					username: data.username,
					uuid: 'offline-' + data.username.toLowerCase(),
					secret: null,
					service: 'Unknown',
					authenticated: true,
				},
				allow: true,
			};
		}
		return { auth: data, allow: false };
	}
}

const logger: ILogger = {
	log: (text: string) => {
		const out = `&8[&f${hourNow()}&8] &f${text}`;

		console.log(colorToTerminal(out));
	},
	error: (text: string) => {
		const out = `&8[&f${hourNow()} &4Error &8] &c${text}`;

		console.log(colorToTerminal(out));
	},
	warn: (text: string) => {
		const out = `&8[&f${hourNow()} &6Warn &8] &6${text}`;

		console.log(colorToTerminal(out));
	},
	chat: (text: string) => {
		const out = `&8[&f${hourNow()}&e Chat &8] &e${text}`;

		console.log(colorToTerminal(out));
	},

	player: (text: string) => {
		const out = `&8[&f${hourNow()} &aPlayer &8] &1${text}`;

		console.log(out);
	},

	storedToFile: false,
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
};

function colorToTerminal(text: string) {
	return text.replaceAll(/&[0-9a-f]/gi, (x) => {
		return `\x1b[39;${colorMap[x[1]]}m`;
	});
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
					out.push(dirEntry.name.substr(0, dirEntry.name.length - 4));
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
					out.push(dirEntry.name.substr(0, dirEntry.name.length - 6));
				}
			}

			return out;
		} catch (e) {
			logger.error(e);
			return [];
		}
	},

	createBaseDirectories(): void {
		['world', 'player', 'config', 'world/backup', 'logs'].forEach((x) => {
			if (!fs.existsSync(`./${x}`)) {
				Deno.mkdirSync(`./${x}`);
			}
		});
	},
};
