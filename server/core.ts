export * from './core/server.ts';
export * from './core/types.ts';
export * from './core/player.ts';
export * as EventType from './core/events.ts';
export { Block } from './core/world/blocks.ts';
export * from './core/world/world.ts';

export * as Vec from './libs/vec.ts';

import { makeMurmur } from './libs/murmur.ts';
export * from './libs/emitter.ts';
export * as Nbt from './libs/nbt/index.ts';

import { createTree, createClassicTree } from './core/world/generation/tree.ts';
import { createOres } from './core/world/generation/ores.ts';
import { sendDataToMain, createWorkerGenerator } from './core/world/generation/general.ts';

export * as Brigadier from './libs/brigadier/index.ts'
export * as Commands from './core/commands.ts'

export * as Uuid from './core/uuid.ts';

export const WorldGen = {
	createClassicTree,
	createTree,
	createOres,
	sendGeneratedWorldFromWorker: sendDataToMain,
	createWorkerGenerator,
	makeMurmur
};
