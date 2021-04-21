export const id = 'hello-world';
export const name = 'Example plugin';
export const version = '0.0.0';
export const cobblestoneApi = '0.0.11';

import { Server } from '../server/core.ts';

export const init = (server: Server) => {
	server.logger.log('&eHello world!');

	server.addCommand({
		name: 'hello',
		description: 'Hello world?',
		execute: (ctx) => {
			ctx.send('&cHello World!');
		},
	});

	server.createWorld('hello', [16, 16, 16], server.getGenerator('flat'));

	server.event.PlayerConnect.on((ctx) => {
		server.logger.log(`Saying hello to ${ctx.value.player.username}`)
		ctx.value.player.sendMessage('Hello!');
	});
};
