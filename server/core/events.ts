import { Player } from './player.ts';
import { Position } from "./types.ts";
import { Block } from "./world/blocks.ts";
import { World } from './world/world.ts';

export interface PlayerConnect {
	readonly player: Player;
}

export interface PlayerDisconnect {
	readonly player: Player;
	readonly reason: string;
}

export interface PlayerChangeWorld {
	readonly player: Player;
	readonly from: World;
	readonly to: World;
}

export interface PlayerMove {
	readonly player: Player;
	readonly position: Position;
}

export interface PlayerColides {
	readonly player: Player;
	readonly with: Player[];
}

export interface PlayerTeleport {
	readonly player: Player;
	readonly position: Position;
	readonly world: World;
}

export interface PlayerMessage {
	readonly player: Player;
	message: string;
}

export interface PlayerCommand {
	readonly player: Player;
	readonly command: string;
}

export interface PlayerChangeBlock {
	readonly player: Player;
	readonly position: Position;
	readonly block: Block;
	readonly world: World;
}
