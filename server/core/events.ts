import { Player } from './player.ts';
import { World } from './world.ts';

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
	position: [number, number, number];
	pitch: number;
	yaw: number;
}

export interface PlayerTeleport {
	player: Player;
	position: [number, number, number];
	world: World,
	yaw?: number,
	pitch?: number,
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
	position: [number, number, number];
	block: number;
	world: World;
}
