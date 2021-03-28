export interface IAuthRequest {
	/** AuthRequest username */
	username?: string | null;

	/** AuthRequest protocol */
	protocol?: number | null;

	/** AuthRequest client */
	client?: string | null;

	/** AuthRequest uuid */
	uuid?: string | null;

	/** AuthRequest secret */
	secret?: string | null;

	/** AuthRequest serverId */
	serverId?: string | null;

	/** AuthRequest proxySupportedVersion */
	proxySupportedVersion?: number | null;
}

/** Properties of a Ready. */
export interface IReady {
	/** Ready ready */
	ready?: boolean | null;
}

/** Properties of a Data. */
export interface IData {
	/** Data message */
	message?: Uint8Array | null;
}

/** Properties of a VoxelSrvMessage. */
export interface IVoxelSrvMessage {
	/** VoxelSrvMessage message */
	message?: Uint8Array | null;
}

/** Properties of a ProxyMessage. */
export interface IProxyMessage {
	/** ProxyMessage message */
	message?: Uint8Array | null;
}
