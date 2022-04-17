import { World } from '../world/world.ts';
import { Nullable, XYZ } from '../types.ts';
import { Player } from '../player.ts';

export interface ConnectionHandler {
	setPlayer(player: Player): void;

	getPlayer(): Nullable<Player>;

	tick(): void;

	sendWorld(world: World): Promise<void>;

	setBlock(x: number, y: number, z: number, block: number): void;

	sendMessage(player: Nullable<Player>, text: string): void;

	disconnect(message: string): void;

	sendTeleport(player: Player, pos: XYZ, yaw: number, pitch: number): void;

	sendMove(player: Player, pos: XYZ, yaw: number, pitch: number): void;

	sendSpawnPlayer(player: Player): void;

	sendDespawnPlayer(player: Player): void;

	getPort(): number;

	getIp(): string;

	getClient(): string;
}

export abstract class WrappedConnectionHandler implements ConnectionHandler {
	abstract getHandler(): Nullable<ConnectionHandler>;

	setPlayer(player: Player): void {
		this.getHandler()?.setPlayer(player);
	}
	getPlayer(): Nullable<Player> {
		return this.getHandler()?.getPlayer() ?? null;
	}
	sendWorld(world: World): Promise<void> {
		return this.getHandler()?.sendWorld(world) ?? new Promise(r => r());
	}
	setBlock(x: number, y: number, z: number, block: number): void {
		return this.getHandler()?.setBlock(x, y, z, block);
	}
	sendMessage(player: Nullable<Player>, text: string): void {
		return this.getHandler()?.sendMessage(player, text);
	}
	disconnect(message: string): void {
		return this.getHandler()?.disconnect(message);
	}
	sendTeleport(player: Player, pos: XYZ, yaw: number, pitch: number): void {
		return this.getHandler()?.sendTeleport(player, pos, yaw, pitch);
	}
	sendMove(player: Player, pos: XYZ, yaw: number, pitch: number): void {
		return this.getHandler()?.sendMove(player, pos, yaw, pitch);
	}
	sendSpawnPlayer(player: Player): void {
		return this.getHandler()?.sendSpawnPlayer(player);
	}
	sendDespawnPlayer(player: Player): void {
		return this.getHandler()?.sendDespawnPlayer(player);
	}
	getPort(): number {
		return this.getHandler()?.getPort() ?? 0;
	}
	getIp(): string {
		return this.getHandler()?.getIp() ?? "";
	}
	getClient(): string {
		return this.getHandler()?.getClient() ?? "UNDEFINED";
	}
	tick() {
		this.getHandler()?.tick()
	}
}
