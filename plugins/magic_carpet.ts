export const id = 'magic_carpet';
export const name = 'Magic Carpet';
export const version = '0.0.0';
export const cobblestoneApi = '0.0.20';

import { Server, Commands, BlockPos, Player } from '../server/core.ts';
import { blockIds } from '../server/core/world/blocks.ts';

const { literal } = Commands;

type CarpetPos = {
	start: BlockPos;
	center: BlockPos;
	end: BlockPos;
};

function sendCarpetUpdate(player: Player, carpet: CarpetPos, enabled: boolean) {
	for (let x = carpet.start.x; x <= carpet.end.x; x++) {
		for (let z = carpet.start.z; z <= carpet.end.z; z++) {
			const block = player.world.getBlock(x, carpet.center.y, z);

			if (block && !block.solid && enabled) {
				player._connectionHandler.setBlock(x, carpet.center.y, z, blockIds.glass);
			} else if (block) {
				player._connectionHandler.setBlock(x, carpet.center.y, z, block.numId);
			}
		}
	}
}

export const init = (server: Server) => {
	server.addCommand(
		literal('mc')
			.requires((src) => src.checkPermission('command.mc').get(true))
			.executes((_ctx, src) => {
				const value = !src.player().getTemp('magic_carpet:enabled');
				src.player().setTemp('magic_carpet:enabled', value);
				const blockPos = src.player().getBlockPos();

				if (value) {
					const pos: CarpetPos = {
						start: { x: blockPos.x - 1, y: blockPos.y - 1, z: blockPos.z - 1 },
						center: { x: blockPos.x, y: blockPos.y - 1, z: blockPos.z },
						end: { x: blockPos.x + 1, y: blockPos.y - 1, z: blockPos.z + 1 },
					};
					src.player().setTemp('magic_carpet:pos', pos);

					sendCarpetUpdate(src.player(), pos, true);
					src.send('Enabled magic carpet!');
				} else {
					const pos = src.player().getTemp<CarpetPos>('magic_carpet:pos');
					if (pos) {
						sendCarpetUpdate(src.player(), pos, false);
					}
					src.player().setTemp('magic_carpet:pos', null);

					src.send('Disabled magic carpet!');
				}
			}),
		'Creates a "magic carpet" you can fly on'
	);

	server.event.PlayerMove.on(({ value }) => {
		if (value.player.getTemp('magic_carpet:enabled')) {
			const pos = value.player.getTemp<CarpetPos>('magic_carpet:pos');
			const blockPos = value.player.getBlockPos();
			if (pos && (pos.center.x != blockPos.x || pos.center.y != blockPos.y - 1 || pos.center.z != blockPos.z)) {
				if (pos) {
					sendCarpetUpdate(value.player, pos, false);
				}
				const newPos = {
					start: { x: blockPos.x - 1, y: blockPos.y - 1, z: blockPos.z - 1 },
					center: { x: blockPos.x, y: blockPos.y - 1, z: blockPos.z },
					end: { x: blockPos.x + 1, y: blockPos.y - 1, z: blockPos.z + 1 },
				};
				value.player.setTemp('magic_carpet:pos', newPos);

				sendCarpetUpdate(value.player, newPos, true);
			}
		}
	});
};
