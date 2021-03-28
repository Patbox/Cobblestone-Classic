import { Server } from './server.ts';
import { HelpPage } from './types.ts';

export function setupCommands(server: Server) {
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

				if (page < 0 || isNaN(NaN)) {
					page = 0;
				}
				try {
					let helpPage: HelpPage | undefined;

					if (command.length == 0) {
						const commands = Object.values(server._commands);
						size = Math.ceil(commands.length / 8);

						const lines: string[] = [];

						if (page >= size) {
							page = 0;
						}

						let x = 0;
						let i = 0;
						while (true) {
							const cmd = commands[x + page * 8];
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
						const pages = server._commands[command].help ?? [];
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
					server.logger.error(`${ctx.player?.username ?? 'Console'} tried to excute ${ctx.command} and it failed!`);
					server.logger.error(e);
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
		help: [
			{
				title: '/spawn command',
				number: 0,
				lines: ['Teleports player to spawnpoint of a world', 'Usage: &6/spawn [<username>]'],
			},
		],

		execute: (ctx) => {
			const args = ctx.command.split(' ');

			if (args.length == 1 && ctx.player) {
				const world = ctx.player.world;
				ctx.player.teleport(world, world.spawnPoint[0], world.spawnPoint[1], world.spawnPoint[2], world.spawnPointYaw, world.spawnPointPitch);
			} else if (args.length == 2) {
				//const world = ctx.player.world;
				//ctx.player.teleport(world, world.spawnPoint[0], world.spawnPoint[1], world.spawnPoint[2], world.spawnPointYaw, world.spawnPointPitch);
			} else {
				ctx.send('&cInvalid arguments! Usage: &6/spawn');
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
		
		}
	});
	*/
}
