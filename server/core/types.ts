import { Player } from "./player.ts";
import { Server } from "./server.ts";

export type XYZ = [number, number, number];

export type Nullable<T> = null | T;

export type Services = 'Unknown' | 'Minecraft' | 'VoxelSrv';

export interface AuthData {
	username: string;
	service: Services;
	uuid: Nullable<string>;
	secret: Nullable<string>;
	authenticated: boolean
}

export type Holder<T> = {[i: string]: T}

export interface ICommand {
	name: string;
	description: string;
	permission?: string;
	execute: (ctx: ICommandContext) => void;
	help?: string[];
}

export interface ICommandContext {
	command: string;
	player: Nullable<Player>;
	server: Server;
	send: (text: string) => void;
}

export interface IGroup {
	name: string;
	visibleName?: string;
	prefix?: string;
	sufix?: string;

	permissions: { [i: string]: Nullable<boolean> };
}

export interface IPlugin {
	id: string;
	name: string;
	version: string;
	api: string;
	init: (server: Server) => void;
	[i: string]: unknown;
}
