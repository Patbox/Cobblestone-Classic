import { Server } from './server.ts';

export type XYZ = [number, number, number];

export class TriState {
	static readonly TRUE = new TriState("true", true);
	static readonly FALSE = new TriState("false", false);
	static readonly DEFAULT = new TriState("default", null);

	readonly value: Nullable<boolean>;
	readonly name: string;

	static of(value: Nullable<boolean>) {
		return value == null ? TriState.DEFAULT : value ? TriState.TRUE : TriState.FALSE;
	}


	private constructor(name: string, state: Nullable<boolean>) {
		this.name = name;
		this.value = state;
	}

	get(value: boolean): boolean {
		return this.value ?? value;
	}
}

export interface Position {
	x: number;
	y: number;
	z: number;
	yaw: number;
	pitch: number;
}

export interface BlockPos {
	x: number;
	y: number;
	z: number;
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


export interface GroupInterface {
	name: string;
	displayName?: string;
	prefix?: string;
	suffix?: string;

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