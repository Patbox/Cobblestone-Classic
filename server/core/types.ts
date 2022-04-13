import { Player } from './player.ts';
import { Server } from './server.ts';

export type XYZ = [number, number, number];

export interface Position {
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
}

export type Nullable<T> = null | T;

export type Services = 'Unknown' | 'Minecraft' | 'ClassiCube';

export type AuthProvider = 'None' | 'Mojang' | 'Betacraft' | 'ClassiCube';


export interface AuthData {
	username: string;
	authProvider: AuthProvider;
	service: Services;
	uuid: Nullable<string>;
	secret: Nullable<string>;
	authenticated: boolean;
}

export type Holder<T> = { [i: string]: T };

export interface Command {
	name: string;
	description: string;
	permission?: string;
	execute: (ctx: CommandContext) => void;
	help?: HelpPage[];
}

export interface CommandContext {
	command: string;
	player: Nullable<Player>;
	server: Server;
	send: (text: string) => void;
	checkPermission: (permission: string) => Nullable<boolean>;
}

export interface GroupInterface {
	name: string;
	visibleName?: string;
	prefix?: string;
	sufix?: string;

	permissions: { [i: string]: Nullable<boolean> };
}

export interface Plugin {
	id: string;
	name: string;
	version: string;
	cobblestoneApi: string;
	init: (server: Server) => void;
	[i: string]: unknown;
}

export interface HelpPage {
	number: number;
	title: string;
	lines: string[];
}


export enum BlockShape {
	CUBE,
	CROSS,
	SLAB_BOTTOM,
	SLAB_TOP,
	STAIR_N,
	STAIR_S,
	STAIR_W,
	STAIR_E,
	FENCE,

	CUSTOM = 256
}

export enum BlockColor {
	WHITE,
	BLACK,
	DARK_BLUE,
	DARK_GREEN,
	DARK_AQUA,
	DARK_RED,
	DARK_PURPLE,
	GOLD,
	GRAY,
	DARK_GRAY,
	BLUE,
	GREEN,
	AQUA,
	RED,
	PINK,
	YELLOW
}

export type BlockMap = Record<string, {numId: number, inGameName: string, solid: boolean, shape: BlockShape}>;