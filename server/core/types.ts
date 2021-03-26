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
