import { VirtualPlayerHolder } from './player.ts';
import { Group, Server } from './server.ts';
import { Command, HelpPage } from './types.ts';

export function setupCommands(server: Server, commands: Map<string, Command>) {
	server.addCommand({
		name: 'help',
		description: 'Contains list of all commands',
		help: [
			{
				title: '/help command',
				number: 0,
				lines: [
					'This command displays list of commands available on server',
					'or information about selected one.',
					'Usage: &6/help <command> [<page>] &aor &6/help <command> [<page>]',
				],
			},
		],

		execute: (ctx) => {
			const invalidUsage = '&cInvalid arguments! Usage: &6/help [<command>] [<page>] &aor &6[<page>]';

			const args = ctx.command.split(' ');
			let page = 0;
			let size = 0;
			let command = '';
			try {
				if (args.length == 1) {
					page = 0;
				} else if (args.length == 2) {
					page = parseInt(args[1]) - 1;

					if (isNaN(page)) {
						command = args[1];
						page = 0;
					}
				} else if (args.length == 3) {
					command = args[1];
					page = parseInt(args[2]) - 1;
				} else {
					throw null;
				}

				if (page < 0 || isNaN(page)) {
					page = 0;
				}

				try {
					let helpPage: HelpPage | undefined;
					if (command.length == 0) {

						size = Math.ceil(commands.size / 8);

						const lines: string[] = [];

						if (page >= size) {
							page = 0;
						}

						let x = 0;
						let i = 0;
						const commandArray = Array.from(commands);

						while (commandArray[x + page * 8]) {
							const cmd = commandArray[x + page * 8][1];
							x += 1;

							if (cmd?.permission && !ctx.checkPermission(cmd.permission)) {
								continue;
							}

							i += 1;

							if (cmd != undefined) {
								lines.push(`&6/${cmd.name} &7- ${cmd.description ?? 'A command'}`);
							}

							if (i >= 8) {
								break;
							}
						}

						helpPage = {
							number: page,
							title: 'Commands',
							lines: lines,
						};
					} else {
						const pages = commands.get(command)?.help ?? [];
						size = pages.length;
						if (size == 0) {
							return;
						}

						if (page >= size) {
							page = 0;
						}

						helpPage = pages[page] ?? pages[0];
					}

					if (helpPage) {
						ctx.send(`&8- &3Help: &6${helpPage.title}`);
						helpPage.lines.forEach(ctx.send);
						ctx.send(`&8[&aPage &b${page + 1}&a out of &b${size}&a pages&8]`);
					} else {
						ctx.send(`&cThis help page doesn't exist!`);
					}
				} catch (e) {
					server.logger.error(`${ctx.player?.username ?? 'Console'} tried to execute ${ctx.command} and it failed!`);
					if (e instanceof TypeError) {
						server.logger.error(e.message);
						if (e.stack) server.logger.error(e.stack);
					} else {
						server.logger.error(e);
					}
					ctx.send('&cError occured while executing this command.');
				}
			} catch {
				ctx.send(invalidUsage);
				return;
			}
		},
	});

	server.addCommand({
		name: 'spawn',
		description: 'Teleports player to spawn (of world)',
		permission: 'commands.spawn',
		help: [
			{
				title: '/spawn command',
				number: 0,
				lines: ['Teleports player to spawnpoint of a world', 'Usage: &6/spawn [<username>]'],
			},
		],

		execute: async (ctx) => {
			const args = ctx.command.split(' ');

			if (args.length == 1 && ctx.player) {
				const world = ctx.player.world;
				await ctx.player.teleport(world, world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z, world.spawnPoint.yaw, world.spawnPoint.pitch);

				ctx.send('&aTeleported to spawn!');
			} else if (args.length == 2 && ctx.player) {
				const world = server.getWorld(args[1]);
				if (world) {
					await ctx.player.changeWorld(world);
					ctx.send(`&aTeleported to spawn of ${world.name}!`);
				} else {
					ctx.send(`&cWorld ${args[1]} doesn't exist!`);
				}
			} else if (args.length == 3 && ctx.checkPermission('commands.spawn.teleportother')) {
				const world = server.getWorld(args[1]);
				const player = server.players.get(server.getPlayerIdFromName(args[2]) ?? '') ?? null;

				if (world && player) {
					await player.teleport(world, world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z, world.spawnPoint.yaw, world.spawnPoint.pitch);
					ctx.send(`&aTeleported ${player.getDisplayName()} to spawn of ${world.name}!`);
				} else {
					ctx.send(`&cInvalid world or player`);
				}
			} else {
				ctx.send('&cInvalid arguments! Usage: &6/spawn [<world>]');
			}
		},
	});

	server.addCommand({
		name: 'main',
		description: 'Teleports to main world',
		permission: 'commands.main',
		help: [
			{
				title: '/main command',
				number: 0,
				lines: ['Teleports player to main world.', 'Usage: &6/main [<username>]'],
			},
		],

		execute: async (ctx) => {
			const args = ctx.command.split(' ');

			if (args.length == 1 && ctx.player) {
				const world = server.getDefaultWorld();
				await ctx.player.teleport(world, world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z, world.spawnPoint.yaw, world.spawnPoint.pitch);

				ctx.send('&aTeleported to main world!');
			} else if (args.length == 2 && ctx.checkPermission('commands.main.teleportother')) {
				const world = server.getDefaultWorld();
				const player = server.players.get(server.getPlayerIdFromName(args[2]) ?? '') ?? null;

				if (player) {
					await player.changeWorld(world);
					ctx.send(`&aTeleported ${player.getDisplayName()} to main world!`);
				} else {
					ctx.send(`&cPlayer ${args[1]} doesn't exist!`);
				}
			} else {
				ctx.send('&cInvalid arguments! Usage: &6/spawn [<username>]');
			}
		},
	});

	server.addCommand({
		name: 'perms',
		description: 'Allows to modify permissions',
		permission: 'commands.perms',
		help: [
			{
				title: '/perms command',
				number: 0,
				lines: [
					'This commands allows to manage permissions and groups',
					'of players.',
					'&6/perms player [<user>] set [<perm>] <true/false> &7-',
					'&7 Sets permission of player',
					'&6/perms player [<user>] remove [<perm>] &7-',
					"&7 Removes player's permission",
					'&6/perms player [<user>] groupadd [<group>] &7-',
					'&7 Adds player to a group',
					'&6/perms player [<user>] groupremove [<group>] &7-',
					'&7 Removes player from a group',
				],
			},
			{
				title: '/perms command',
				number: 1,
				lines: [
					'&6/perms group [<group>] set [<perm>] <true/false> &7-',
					'&7 Sets permission of group',
					'&6/perms group [<group>] remove [<perm>] &7-',
					"&7 Removes group's permission",
					'&6/perms group [<group>] prefix <prefix> &7-',
					'&7 Changes groups prefix',
					'&6/perms group [<group>] suffix <prefix> &7-',
					'&7 Changes groups suffix',
					'&6/perms group [<group>] name <visible name> &7-',
					'&7 Changes visible name of a group',
				],
			},
		],

		execute: (ctx) => {
			const args = ctx.command.split(' ');

			try {
				if (args.length >= 4) {
					switch (args[1]) {
						case 'user':
						case 'player':
							{
								const uuid = server.getPlayerIdFromName(args[2]);
								if (!uuid) throw 'p';
								const player = new VirtualPlayerHolder(uuid, server);
								let tmp = false;

								switch (args[3]) {
									case 'add':
									case 'set':
										tmp = ('' + args[4]).toLowerCase() != 'false';
										player.setPermission(args[4], tmp);
										ctx.send(`&aChanged permission &6${args[4]}&a of &f${player.getName()}&a to &6${tmp}&a.`);
										break;
									case 'remove':
										player.setPermission(args[4], null);
										ctx.send(`&aRemoved permission &6${args[4]}&a from &f${player.getName()}&a.`);
										break;
									case 'groupadd':
										player.addGroup(args[4]);
										ctx.send(`&aAdded &f${player.getName()}&a to group &f${args[4]}&a.`);
										break;
									case 'groupremove':
										player.removeGroup(args[4]);
										ctx.send(`&aRemoved &f${player.getName()}&a from group &f${args[4]}&a.`);
										break;
									default:
										throw 'ia';
								}

								player.finish();
							}
							break;
						case 'group':
							{
								let group = server.groups.get(args[2]);
								let tmp = false;
								if (!group) {
									group = new Group({ name: args[2], permissions: {} });
									server.groups.set(args[2], group);
								}

								switch (args[3]) {
									case 'set':
										tmp = ('' + args[4]).toLowerCase() != 'false';
										group.setPermission(args[4], tmp);
										ctx.send(`&aChanged permission &6${args[3]}&a of group &f${group.getName()}&a to &6${tmp}.`);
										break;
									case 'remove':
										group.setPermission(args[4], null);
										ctx.send(`&aRemoved permission &6${args[3]}&a from group &f${group.getName()}&a.`);
										break;
									case 'prefix':
										group.prefix = args[4] ?? '';
										ctx.send(`&aChanged prefix of &f${group.getName()}&a to &f${args[4] ?? '<EMPTY>'}&a.`);
										break;
									case 'suffix':
										group.sufix = args[4] ?? '';
										ctx.send(`&aChanged suffix of &f${group.getName()}&a to &f${args[4] ?? '<EMPTY>'}&a.`);
										break;
									case 'name':
										group.visibleName = args[4] ?? undefined;
										ctx.send(`&aChanged display name of &f${group.name}&a to &f${group.visibleName ?? group.name}}&a.`);
										break;
									default:
										throw 'ia';
								}
							}
							break;
						default:
							throw 'ia';
					}
				} else {
					throw 'ia';
				}
			} catch (e) {
				if (e == 'ia') {
					ctx.send('&cInvalid arguments! Check /help perms!');
				} else if (e == 'p' || e == 'No player!') {
					ctx.send('&cInvalid player!');
				}
			}
		},
	});

	server.addCommand({
		name: 'maps',
		description: 'List all loaded maps',
		permission: 'commands.maps',
		execute: (ctx) => {
			ctx.send('&aAvailable worlds:');
			let temp = ' ';
			server.worlds.forEach((w) => {
				temp == ' ' ? (temp += w.name) : (temp = [temp, w.name].join('&7,&f '));

				if (temp.length > 50) {
					ctx.send(temp);
					temp = ' ';
				}
			});

			temp != '' ? ctx.send(temp) : null;
		},
	});

	server.addCommand({
		name: 'goto',
		description: 'Allows to switch between worlds',
		permission: 'commands.goto',
		execute: async (ctx) => {
			if (!ctx.player) {
				ctx.send('&cOnly players can use this command!');
				return;
			}

			const args = ctx.command.split(' ');
			if (args.length == 2) {
				const world = server.getWorld(args[1]);

				if (world) {
					await ctx.player.changeWorld(world);
					ctx.send(`&aTeleported to world ${world.name}!`);
				} else {
					ctx.send("&cThis world doesn't exist!");
				}
			} else {
				ctx.send('&cInvalid arguments! Usage: &6/goto <world name>');
			}
		},
	});

	server.addCommand({
		name: 'world',
		description: 'Allows to access, modify and create worlds',
		permission: 'commands.world.base',
		help: [
			{
				title: '/world command',
				number: 0,
				lines: [
					'This commands allow admins to manipulate worlds!',
					'&6/world create <name> <x> <y> <z> <generator> [<seed>]',
					'&7 creates new world.',
					'&6/world spawnpoint',
					"&7 Changes spawnpoint of world to player's position",
					'&6/world physics <name> <value>',
					"&7 Changes world's physics mode",
					'&6/world delete <name>',
					'&7 Deletes world',
					'&6/world generators',
					'&7 Lists all generators',
				],
			},
			{
				title: '/world command',
				number: 1,
				lines: [
					'&6/world backup <name>',
					'&7 creates backup of world.',
				],
			},
		],

		execute: async (ctx) => {
			const args = ctx.command.split(' ');

			try {
				if (args.length >= 2) {
					switch (args[1]) {
						case 'create':
							{
								if (!ctx.checkPermission('commands.world.create')) throw 'perm';
								if (args.length < 7) throw 'ia';

								const name = args[2];
								const sizeX = parseInt(args[3]);
								const sizeY = parseInt(args[4]);
								const sizeZ = parseInt(args[5]);
								const generator = server.getGenerator(args[6]);
								let seed = parseInt(args[7]);

								if (isNaN(seed)) {
									seed = 0;
								}

								if (!generator) {
									ctx.send('&cInvalid world generator! Check &6/world generator list');
									return;
								}

								const [minX, minY, minZ] = generator.minimalSize;

								if (
									isNaN(sizeX) ||
									isNaN(sizeY) ||
									isNaN(sizeZ) ||
									sizeX <= minX ||
									sizeY <= minY ||
									sizeZ <= minZ ||
									sizeX > 1024 ||
									sizeY > 1024 ||
									sizeZ > 1024
								) {
									ctx.send(`&cInvalid world size!`);
									ctx.send(`&cMinimal suppored: &6${minX} ${minY} ${minZ}`);
									ctx.send(`&cMaximal: &61024 1024 1024`);

									return;
								}

								ctx.send('&eWorld creation started! It can take a while...');

								const world = await server.createWorld(name, [sizeX, sizeY, sizeZ], generator, seed, ctx.player ?? undefined);
								if (!world) {
									ctx.send("&aCouldn't create this world!");
									return;
								}

								ctx.send('&aWorld created!');
								ctx.player?.changeWorld(world);
							}
							break;
						case 'spawnpoint':
							{
								if (!ctx.checkPermission('commands.world.spawnpoint')) throw 'perm';
								if (!ctx.player) throw 'po';

								const world = ctx.player.world;
								world.spawnPoint = ctx.player.getPosition();

								ctx.send(`&aChanged worlds spawnpoint to ${world.spawnPoint.x}, ${world.spawnPoint.y}, ${world.spawnPoint.z}.`);
							}
							break;
						case 'delete':
							{
								if (!ctx.checkPermission('commands.world.delete')) throw 'perm';
								if (args.length != 3) throw 'ia';

								const name = args[2];

								const world = server.deleteWorld(name);
								if (world) {
									ctx.send('&aWorld deleted!');
									return;
								} else {
									ctx.send("&cCouldn't delete this world! It's protected or invalid!");
								}
							}
							break;
						case 'backup':
							{
								if (!ctx.checkPermission('commands.world.backup')) throw 'perm';
								if (args.length != 3) throw 'ia';

								const name = args[2];

								const world = server.getWorld(name);
								if (world) {
									world.backup();
									ctx.send('&aWorld backedup!');
									return;
								} else {
									ctx.send("&cCouldn't backup this world! It's unloaded or invalid!");
								}
							}
							break;
						case 'physics':
							{
								if (!ctx.checkPermission('commands.world.physics')) throw 'perm';
								if (args.length != 4) throw 'ia';
								const name = args[2];
								const lvl = parseInt(args[3]);

								if (isNaN(lvl)) throw 'ia';

								const world = server.getWorld(name);

								if (world) {
									world.physics = lvl;
									ctx.send(`&aChanged worlds physics level to ${lvl}!`);
								} else {
									ctx.send("&cCouldn't delete this world! It's protected or invalid!");
								}
							}
							break;
						case 'generators':
							{
								ctx.send('&aAvailable generators:');
								let temp = ' ';
								server.getAllGenerators().forEach((w) => {
									temp == ' ' ? (temp += w.name) : (temp = [temp, w.name].join('&7,&f '));

									if (temp.length > 50) {
										ctx.send(temp);
										temp = ' ';
									}
								});

								temp != '' ? ctx.send(temp) : null;
							}
							break;
					}
				} else {
					throw 'ia';
				}
			} catch (e) {
				if (e == 'ia') {
					ctx.send('&cInvalid arguments! Check /help world!');
				} else if (e == 'p' || e == 'No player!') {
					ctx.send('&cInvalid player!');
				} else if (e == 'po') {
					ctx.send('&cThis command can be only executed by players!');
				} else if (e == 'perm') {
					ctx.send("&cYou don't have required permissions!");
				}
			}
		},
	});

	/* Template

	server.addCommand({
		name: '',
		description: '',
		help: [
			{
				title: '',
				number: 0,
				lines: [
					
				],
			},
		],

		execute: (ctx) => {
			const args = ctx.command.split(' ');
		}
	});
	*/
}
