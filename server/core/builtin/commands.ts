import { word, greedyString, IntegerArgumentType } from '../../libs/brigadier/index.ts';
import { CommandInfo, literal, argument, KeyedArgumentType, TriStateArgumentType, XYZFloatArgumentType, BlockPosArgumentType } from '../commands.ts';
import { Player, VirtualPlayerHolder } from '../player.ts';
import { Group, Server } from '../server.ts';
import { TriState, XYZ } from '../types.ts';
import { PhysicsLevel, World, WorldGenerator } from '../world/world.ts';

export function setupCommands(server: Server, infos: Map<string, CommandInfo>) {
	server.addCommand(
		literal('stop')
			.requires((x) => x.checkPermission('commands.stop').get(false))
			.executes((_ctx, src) => {
				src.server.stopServer();
			}),
		'Shutdowns the server'
	);

	server.addCommand(
		literal('tp')
			.requires((x) => x.checkPermission('commands.tp').get(false))
			.then(
				argument('pos', new XYZFloatArgumentType())
					.requires((x) => x.checkPermission('commands.tp.pos').get(false))

					.executes((ctx, src) => {
						const pos = ctx.getTyped<XYZ>('pos');
						src.player().teleport(src.player().world, pos[0], pos[1], pos[2]);
						src.send(`&aTeleported at ${pos[0]} ${pos[1]} ${pos[2]}`);
					})
			)
			.then(
				argument('player', KeyedArgumentType.onlinePlayer(server))
					.requires((x) => x.checkPermission('commands.tp.player').get(false))
					.executes((ctx, src) => {
						const target = ctx.getTyped<Player>('player');
						src.player().teleport(src.player().world, target.position[0], target.position[1], target.position[2]);
						src.send(`&aTeleported to ${target.getDisplayName()}`);
					})
			),
		'Teleports player',
		[
			{
				title: '/tp command',
				number: 0,
				lines: [
					'Teleports player to location or other player',
					'&6/tp [<x>] [<y>] [<z>] &7- Teleports to location in world',
					'&6/tp [<player>] &7- Teleports to player',
				],
			},
		]
	);

	server.addCommand(
		literal('help')
			.requires((ctx) => ctx.checkPermission('commands.help').get(true))
			.executes((_ctx, src) => src.server.executeCommand('help 1', src))
			.then(
				argument('page', new IntegerArgumentType(1)).executes((ctx, src) => {
					let page = ctx.getTyped<number>('page') - 1;
					const size = Math.ceil(infos.size / 8);

					const lines: string[] = [];

					if (page >= size) {
						page = 0;
					}

					let x = 0;
					let i = 0;
					const commandArray = Array.from(infos);

					while (commandArray[x + page * 8]) {
						const cmd = commandArray[x + page * 8][1];
						x += 1;

						if (!cmd.node.canUse(src)) {
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

					src.send(`&8- &3Help: &6Commands`);
					lines.forEach(src.send);
					src.send(`&8[&aPage &b${page + 1}&a out of &b${size}&a pages&8]`);
				})
			)
			.then(
				argument('command', new KeyedArgumentType<CommandInfo>('command', (x) => infos.get(x) ?? null))
					.executes((ctx, src) => src.server.executeCommand(ctx.getInput() + ' 1', src))
					.then(
						argument('page', new IntegerArgumentType(1)).executes((ctx, src) => {
							let page = ctx.getTyped<number>('page') - 1;
							const info = ctx.getTyped<CommandInfo>('command');
							const size = info.help?.length ?? 0;

							if (page >= size) {
								page = 0;
							}

							if (page >= size) {
								page = 0;
							}

							const helpPage = info.help?.[page] ??
								info.help?.[0] ?? {
									title: `/${info.name} command`,
									lines: [info.description],
									number: 0,
								};

							src.send(`&8- &3Help: &6${helpPage.title}`);
							helpPage.lines.forEach(src.send);
							src.send(`&8[&aPage &b${page + 1}&a out of &b${size}&a pages&8]`);
						})
					)
			),
		'Contains list of all commands',
		[
			{
				title: '/help command',
				number: 0,
				lines: [
					'This command displays list of commands available on server',
					'or information about selected one.',
					'Usage: &6/help <command> [<page>] &aor &6/help <command> [<page>]',
				],
			},
		]
	);

	server.addCommand(
		literal('spawn')
			.requires((x) => x.checkPermission('commands.spawn').get(true))
			.executes((_ctx, source) => {
				const world = source.player().world;
				source.player().teleport(world, world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z, world.spawnPoint.yaw, world.spawnPoint.pitch);

				source.send('&aTeleported to spawn!');

				return 0;
			})
			.then(
				argument('world', KeyedArgumentType.world(server))
					.requires((x) => x.checkPermission('commands.spawn.world').get(false))

					.executes((ctx, source) => {
						const world = ctx.getTyped<World>('world');
						source.player().teleport(world, world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z, world.spawnPoint.yaw, world.spawnPoint.pitch);

						source.send(`&aTeleported to spawn in ${world.name}!`);

						return 0;
					})
					.then(
						argument('player', KeyedArgumentType.onlinePlayer(server))
							.requires((x) => x.checkPermission('commands.spawn.others').get(false))

							.executes((ctx, source) => {
								const world = ctx.getTyped<World>('world');
								const player = ctx.getTyped<Player>('player');
								player.teleport(world, world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z, world.spawnPoint.yaw, world.spawnPoint.pitch);

								source.send(`&aTeleported ${player.getDisplayName()} to spawn of ${world.name}!`);

								return 0;
							})
					)
			),

		'Teleports player to spawn (of world)',
		[
			{
				title: '/spawn command',
				number: 0,
				lines: ['Teleports player to a world', 'Usage: &6/spawn [<world>] [<username>]'],
			},
		]
	);

	server.addCommand(
		literal('goto')
			.requires((x) => x.checkPermission('commands.goto').get(true))
			.then(
				argument('world', KeyedArgumentType.world(server))
					.executes((ctx, source) => {
						const world = ctx.getTyped<World>('world');
						source.player().changeWorld(world);

						source.send(`&aTeleported to world ${world.name}!`);

						return 0;
					})
					.then(
						argument('player', KeyedArgumentType.onlinePlayer(server))
							.requires((x) => x.checkPermission('commands.goto.others').get(false))

							.executes((ctx, source) => {
								const world = ctx.getTyped<World>('world');
								const player = ctx.getTyped<Player>('player');
								player.changeWorld(world);

								source.send(`&aTeleported ${player.getDisplayName()} to ${world.name}!`);

								return 0;
							})
					)
			),

		'Teleports player to selected world',
		[
			{
				title: '/goto command',
				number: 0,
				lines: ['Teleports player to seleted world', 'Usage: &6/goto <world> [<username>]'],
			},
		]
	);

	server.addCommand(
		literal('main')
			.requires((x) => x.checkPermission('commands.main').get(true))
			.executes((_ctx, src) => {
				const world = server.getDefaultWorld();
				src.player().teleport(world, world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z, world.spawnPoint.yaw, world.spawnPoint.pitch);
				src.send('&aTeleported to main world!');
			})
			.then(
				argument('player', KeyedArgumentType.onlinePlayer(server))
					.requires((x) => x.checkPermission('commands.main.others').get(false))
					.executes((ctx, src) => {
						const world = server.getDefaultWorld();
						ctx
							.getTyped<Player>('player')
							.teleport(world, world.spawnPoint.x, world.spawnPoint.y, world.spawnPoint.z, world.spawnPoint.yaw, world.spawnPoint.pitch);
						src.send('&aTeleported to main world!');
					})
			),
		'Teleports to main world',
		[
			{
				title: '/main command',
				number: 0,
				lines: ['Teleports player to main world.', 'Usage: &6/main [<username>]'],
			},
		]
	);

	server.addCommand(
		literal('maps')
			.requires((x) => x.checkPermission('commands.maps').get(true))
			.executes((_ctx, src) => {
				src.send('&aAvailable worlds:');
				let temp = ' ';
				server.worlds.forEach((w) => {
					temp == ' ' ? (temp += w.name) : (temp = [temp, w.name].join('&7,&f '));

					if (temp.length > 50) {
						src.send(temp);
						temp = ' ';
					}
				});

				temp != '' ? src.send(temp) : null;
			}),
		'List all loaded maps'
	);

	server.addCommand(
		literal('perms')
			.requires((x) => x.checkPermission('commands.perms').get(false))
			.then(
				literal('user').then(
					argument('player', KeyedArgumentType.playerHolder(server))
						.then(
							literal('set').then(
								argument('permission', word())
									.executes((ctx, src) => {
										const perm = ctx.getTyped<string>('permission');
										const player = ctx.getTyped<VirtualPlayerHolder>('player');
										player.setPermission(perm, TriState.TRUE);
										src.send(`&aChanged permission &6${perm}&a of &f${player.getName()}&a to &6true&a.`);
										player.finish();
									})
									.then(
										argument('value', new TriStateArgumentType()).executes((ctx, src) => {
											const perm = ctx.getTyped<string>('permission');
											const player = ctx.getTyped<VirtualPlayerHolder>('player');
											const value = ctx.getTyped<TriState>('value');
											player.setPermission(perm, value);
											src.send(`&aChanged permission &6${perm}&a of &f${player.getName()}&a to &6${value.name}&a.`);
											player.finish();
										})
									)
							)
						)
						.then(
							literal('removeperm').then(
								argument('permission', word()).executes((ctx, src) => {
									const perm = ctx.getTyped<string>('permission');
									const player = ctx.getTyped<VirtualPlayerHolder>('player');
									player.setPermission(perm, TriState.DEFAULT);
									src.send(`&aaRemoved permission &6${perm}&a from &f${player.getName()}&a.`);
									player.finish();
								})
							)
						)
						.then(
							literal('groupadd').then(
								argument('group', KeyedArgumentType.group(server)).executes((ctx, src) => {
									const group = ctx.getTyped<Group>('group');
									const player = ctx.getTyped<VirtualPlayerHolder>('player');
									player.addGroup(group.name);
									src.send(`&aAdded &f${player.getName()}&a to group &f${group.name}&a.`);
									player.finish();
								})
							)
						)
						.then(
							literal('groupremove').then(
								argument('group', KeyedArgumentType.group(server)).executes((ctx, src) => {
									const group = ctx.getTyped<Group>('group');
									const player = ctx.getTyped<VirtualPlayerHolder>('player');
									player.addGroup(group.name);
									src.send(`&aRemoved &f${player.getName()}&a from group &f${group.name}&a.`);
									player.finish();
								})
							)
						)
				)
			)
			.then(
				literal('group').then(
					argument('group', KeyedArgumentType.group(server, true))
						.then(
							literal('set').then(
								argument('permission', word())
									.executes((ctx, src) => {
										const perm = ctx.getTyped<string>('permission');
										const group = ctx.getTyped<Group>('group');
										group.setPermission(perm, true);
										src.send(`&aChanged permission &6${perm}&a of group &f${group.getName()}&a to &6true&a.`);
									})
									.then(
										argument('value', new TriStateArgumentType()).executes((ctx, src) => {
											const perm = ctx.getTyped<string>('permission');
											const group = ctx.getTyped<Group>('group');
											const value = ctx.getTyped<TriState>('value');
											group.setPermission(perm, value.value);
											src.send(`&aChanged permission &6${perm}&a of group &f${group.getName()}&a to &6${value.name}&a.`);
										})
									)
							)
						)
						.then(
							literal('removeperm').then(
								argument('permission', word()).executes((ctx, src) => {
									const perm = ctx.getTyped<string>('permission');
									const group = ctx.getTyped<Group>('group');
									group.setPermission(perm, null);
									src.send(`&aRemoved permission &6${perm}&a from group &f${group.getName()}&a.`);
								})
							)
						)

						.then(
							literal('prefix')
								.executes((ctx, src) => {
									const group = ctx.getTyped<Group>('group');
									group.prefix = undefined;
									src.send(`&aCleared prefix of group &f${group.getName()}&a.`);
								})
								.then(
									argument('value', greedyString()).executes((ctx, src) => {
										const group = ctx.getTyped<Group>('group');
										group.prefix = ctx.getTyped<string>('value');
										src.send(`&aChanged prefix of &f${group.getName()}&a to &f${group.prefix}&a.`);
									})
								)
						)

						.then(
							literal('suffix')
								.executes((ctx, src) => {
									const group = ctx.getTyped<Group>('group');
									group.suffix = undefined;
									src.send(`&aCleared suffix of group &f${group.getName()}&a.`);
								})
								.then(
									argument('value', greedyString()).executes((ctx, src) => {
										const group = ctx.getTyped<Group>('group');
										group.suffix = ctx.getTyped<string>('value');
										src.send(`&aChanged suffix of &f${group.getName()}&a to &f${group.suffix}&a.`);
									})
								)
						)

						.then(
							literal('display')
								.executes((ctx, src) => {
									const group = ctx.getTyped<Group>('group');
									group.suffix = undefined;
									src.send(`&aCleared display name of group &f${group.getName()}&a.`);
								})
								.then(
									argument('value', greedyString()).executes((ctx, src) => {
										const group = ctx.getTyped<Group>('group');
										group.displayName = ctx.getTyped<string>('value');
										src.send(`&aChanged display name of &f${group.getName()}&a to &f${group.displayName}&a.`);
									})
								)
						)
				)
			),

		'Allows to modify permissions',
		[
			{
				title: '/perms command',
				number: 0,
				lines: [
					'This commands allows to manage permissions and groups',
					'of players.',
					'&6/perms user [<user>] set [<perm>] <true/false> &7-',
					'&7 Sets permission of player',
					'&6/perms user [<user>] remove [<perm>] &7-',
					"&7 Removes player's permission",
					'&6/perms user [<user>] groupadd [<group>] &7-',
					'&7 Adds player to a group',
					'&6/perms user [<user>] groupremove [<group>] &7-',
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
					'&6/perms group [<group>] display <visible name> &7-',
					'&7 Changes visible name of a group',
				],
			},
		]
	);

	server.addCommand(
		literal('world')
			.requires((ctx) => ctx.checkPermission('command.world').get(false))
			.then(
				literal('create')
					.requires((ctx) => ctx.checkPermission('command.world.create').get(false))
					.then(
						argument('name', word()).then(
							argument('size', new BlockPosArgumentType()).then(
								argument('generator', new KeyedArgumentType('generator', (x) => server.getAllGenerators().get(x)))
									.executes((ctx, src) => server.executeCommand(ctx.getInput() + ' 0', src))
									.then(
										argument('seed', new IntegerArgumentType()).executes((ctx, src) => {
											const name = ctx.getTyped<string>('name');
											const [sizeX, sizeY, sizeZ] = ctx.getTyped<XYZ>('size');
											const generator = ctx.getTyped<WorldGenerator>('generator');
											let seed = ctx.getTyped<number>('seed');

											if (isNaN(seed)) {
												seed = 0;
											}

											if (!generator) {
												src.sendError('Invalid world generator! Check &6/world generator list');
												return;
											}

											const [minX, minY, minZ] = generator.minimalSize;

											if (sizeX < minX || sizeY < minY || sizeZ < minZ || sizeX > 1024 || sizeY > 1024 || sizeZ > 1024) {
												src.sendError(`Invalid world size!`);
												src.sendError(`Minimal suppored: &6${minX} ${minY} ${minZ}`);
												src.sendError(`Maximal: &61024 1024 1024`);

												return;
											}

											src.send('&eWorld creation started! It can take a while...');

											(async () => {
												let lastText = '';
												let lastPercent = -9999;
												const world = await server.createWorld(name, [sizeX, sizeY, sizeZ], generator, seed, src.playerOrNull(), (text, percent) => {
													if (lastText != text || Math.abs(lastPercent - percent) >= 20) {
														lastPercent = percent;
														lastText = text;
														src.send(`&8[&eGenerating ${name}&8]:&7 ${text} &8(${percent.toFixed()}%)`);
													}
												});
												
												
												
												if (!world) {
													src.sendError("Couldn't create this world!");
													return;
												}

												src.send('&aWorld created!');
												src.playerOrNull()?.changeWorld(world);
											})();
										})
									)
							)
						)
					)
			)
			.then(
				literal('spawnpoint')
					.requires((ctx) => ctx.checkPermission('command.world.spawnpoint').get(false))
					.executes((_ctx, src) => {
						const world = src.player().world;
						world.spawnPoint = src.player().getPosition();

						src.send(`&aChanged worlds spawnpoint to ${world.spawnPoint.x}, ${world.spawnPoint.y}, ${world.spawnPoint.z}.`);
					})
			)
			.then(
				literal('delete')
					.requires((ctx) => ctx.checkPermission('command.world.delete').get(false))
					.then(
						argument('world', KeyedArgumentType.world(server)).executes((ctx, src) => {
							const name = ctx.getTyped<World>('world');

							const world = server.deleteWorld(name.fileName);
							if (world) {
								src.send('&aWorld deleted!');
								return;
							} else {
								src.sendError("Couldn't delete this world! It's protected or invalid!");
							}
						})
					)
			)
			.then(
				literal('backup')
					.requires((ctx) => ctx.checkPermission('command.world.backup').get(false))
					.then(
						argument('world', KeyedArgumentType.world(server)).executes((ctx, src) => {
							const world = ctx.getTyped<World>('world');
							world.backup();
							src.send('&aWorld backedup!');
						})
					)
			)
			.then(
				literal('physics')
					.requires((ctx) => ctx.checkPermission('command.world.physics').get(false))
					.then(
						argument('world', KeyedArgumentType.world(server))
							.then(argument('level', new IntegerArgumentType(PhysicsLevel.NONE, PhysicsLevel.FULL)))
							.executes((ctx, src) => {
								const world = ctx.getTyped<World>('world');
								const lvl = ctx.getTyped<number>('level');

								if (isNaN(lvl)) throw 'ia';

								if (world) {
									world.physics = lvl;
									src.send(`&aChanged worlds physics level to ${lvl}!`);
								}
							})
					)
			)
			.then(
				literal('generators')
					.requires((ctx) => ctx.checkPermission('command.world.generators').get(true))
					.executes((_ctx, src) => {
						src.send('&aAvailable generators:');
						let temp = ' ';
						server.getAllGenerators().forEach((w) => {
							temp == ' ' ? (temp += w.name) : (temp = [temp, w.name].join('&7,&f '));

							if (temp.length > 50) {
								src.send(temp);
								temp = ' ';
							}
						});

						temp != '' ? src.send(temp) : null;
					})
			),

		'Allows to access, modify and create worlds',
		[
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
				lines: ['&6/world backup <name>', '&7 creates backup of world.'],
			},
		]
	);
}
