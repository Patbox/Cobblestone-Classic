/** Properties of a LoginRequest. */
export interface IProxyInfo {
	/** LoginRequest name */
	name?: string | null;

	/** LoginRequest protocol */
	proxyProtocol?: number | null;

	/** LoginRequest onlinePlayers */
	onlinePlayers?: number | null;

	/** LoginRequest maxPlayers */
	maxPlayers?: number | null;

	/** LoginRequest motd */
	motd?: string | null;

	/** LoginRequest software */
	software?: string | null;

	/** LoginRequest auth */
	auth?: boolean | null;

	/** LoginRequest secret */
	secret?: string | null;

	/** LoginRequest isProxy */
	isProxy?: boolean | null;
}

/** Properties of an AuthResponce. */
export interface IAuthResponce {
	/** AuthResponce responce */
	responce?: number | null;

	/** AuthResponce message */
	message?: string | null;

	/** AuthResponce proxyVersion */
	proxyVersion?: number | null;

	/** AuthResponce proxyVersionRev */
	proxyVersionRev?: number | null;

	/** AuthResponce protocol */
	protocol?: number | null;

	/** AuthResponce usePacketTranslation */
	usePacketTranslation?: boolean | null;

	/** AuthResponce type */
	type?: string | null;
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

/** Properties of a Disconnect. */
export interface IDisconnect {
	/** Disconnect reason */
	reason?: string | null;
}

/** Properties of a ProxyMessage. */
export interface IProxyMessage {
	/** ProxyMessage message */
	message?: Uint8Array | null;
}
