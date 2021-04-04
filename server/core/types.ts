import { Player } from './player.ts';
import { Server } from './server.ts';

export type XYZ = [number, number, number];

export type Nullable<T> = null | T;

export type Services = 'Unknown' | 'Minecraft' | 'VoxelSrv' | 'ClassiCube';

export type SubServices = 'Betacraft';

export interface AuthData {
	username: string;
	service: Services;
	subService: Nullable<SubServices>;
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
