import { Player } from './player.ts';
import { Position } from "./types.ts";
import { Block } from "./world/blocks.ts";
import { World } from './world/world.ts';

export interface PlayerConnect {
	player: Player;
}

export interface PlayerDisconnect {
	player: Player;
	reason: string;
}

export interface PlayerChangeWorld {
	player: Player;
	from: World;
	to: World;
}

export interface PlayerMove {
	player: Player;
	position: Position;
}

export interface PlayerColides {
	player: Player;
	with: Player[];
}

export interface PlayerTeleport {
	player: Player;
	position: Position;
	world: World;
}

export interface PlayerMessage {
	player: Player;
	message: string;
}

export interface PlayerCommand {
	player: Player;
	command: string;
}

export interface PlayerChangeBlock {
	player: Player;
	position: Position;
	block: Block;
	world: World;
}
