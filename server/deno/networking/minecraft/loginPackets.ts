import { Holder } from "../../../core/types.ts";
import type { PacketHandler } from "./handler.ts";
import { PacketWriter } from "./packet.ts";

export const loginPackets: PacketHandler[] = []

loginPackets[0x00] = async (handler, data) => {
	const username = data.readString();

	/*const hasSigning = data.readBool();

	if (hasSigning) {
		const _timestamp = data.readLong();
		const _publicKey = data.readByteArray(data.readVarInt());
		const _signature = data.readByteArray(data.readVarInt());
	}*/

	const result = await handler._server.authenticatePlayer({
		uuid: username.toLowerCase(),
		username: username,
		authProvider: 'None',
		service: 'Minecraft',
		secret: null,
		authenticated: false,
	});

	if (result.allow) {
		handler.authData = result.auth;

		//handler.send(packet.setCompression(512))
		//handler.compression = 512;

		handler.send(packet.loginSuccess(username, handler.selfUuid))

		handler.switchToPlay();
	} else {
		handler.send(packet.disconnect({ text: "Authentication failed!" }))
	}
}


export const packet = {
	disconnect: (text: Holder<unknown>) => {
		return new PacketWriter().writeVarInt(0x00).writeString(JSON.stringify(text));
	},

	loginSuccess: (name: string, uuid: string) => {
		return new PacketWriter().writeVarInt(0x02).writeUUID(uuid).writeString(name).writeVarInt(0);
	},

	setCompression: (value: number) => {
		return new PacketWriter().writeVarInt(0x03).writeVarInt(value);
	}
}