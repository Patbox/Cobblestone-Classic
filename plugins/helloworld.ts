export const id = 'hello-world';
export const name = 'Example plugin';
export const version = '0.0.0';
export const cobblestoneApi = '0.0.17';

import { Server, WorldView } from '../server/core.ts';

export const init = (server: Server) => {
	server.logger.log('&eHello world!');

	server.addCommand({
		name: 'hello',
		description: 'Hello world?',
		execute: (ctx) => {
			ctx.send('&cHello World!');
		},
	});


	server.addGenerator({
		name: "hellogen",
		software: "Cobblestone/Hello World",
		minimalSize: [32, 32, 32],
		generate: (sizeX: number, sizeY: number, sizeZ: number, _seed?: number) => {
			const world = new WorldView(null, sizeX, sizeY, sizeZ);

			for (let i = 0; i < sizeX; i++) {
				const x = i * 2 % 16 + 16;
				const z = (i * 2 / 16) * 2 + 8;

				world.setBlockId(x, 0, z, i);

			}

			return new Promise((r) => {
				r(world);
			})
		}
	})

	server.deleteWorld('hello')
	server.createWorld('hello', [32, 32, 32], server.getGenerator('hellogen'));

	server.event.PlayerConnect.on((ctx) => {
		server.logger.log(`Saying hello to ${ctx.value.player.username}`)
		ctx.value.player.sendMessage('Hello!');
	});
};
