import { ArgumentType, CommandErrorType, LiteralArgumentBuilder, LiteralCommandNode, RequiredArgumentBuilder, StringReader } from "../libs/brigadier/index.ts";
import { Player, VirtualPlayerHolder } from "./player.ts";
import { Group, Server } from "./server.ts";
import { HelpPage, Nullable, TriState, XYZ } from "./types.ts";
import { World } from "./world/world.ts";

export const ErrorTypes = {
	playerRequired: new CommandErrorType(() => `This command can by executed only by players!`),
	invalidKey: new CommandErrorType((type) => `Invalid ${type}!`),
	invalidTriState: new CommandErrorType(() => `Invalid TriState! Expected "true", "false" or "default"!`)
} 


export interface CommandInfo {
	name: string;
	node: LiteralCommandNode<CommandSource>;
	description: string;
	help?: HelpPage[];
}

export interface CommandSource {
	player: () => Player;
	playerOrNull: () => Nullable<Player>;
	server: Server;
	send: (text: string) => void;
	sendError: (text: string) => void;
	checkPermission: (permission: string) => TriState;
}

export function literal(name: string): LiteralArgumentBuilder<CommandSource> {
    return new LiteralArgumentBuilder<CommandSource>(name);
}

// deno-lint-ignore no-explicit-any
export function argument(name: string, type: ArgumentType<any>): RequiredArgumentBuilder<CommandSource, any> {
    // deno-lint-ignore no-explicit-any
    return new RequiredArgumentBuilder<CommandSource, any>(name, type);
}


export class KeyedArgumentType<T> extends ArgumentType<T> {

	private readonly getter: (string: string) => Nullable<T>;
	private readonly name: string;

	constructor(name: string, getter: (string: string) => Nullable<T>) {
		super();
		this.name = name;
		this.getter = getter;
	}

	parse(reader: StringReader): T {
		const key = reader.readString();
		const value = this.getter(key);
		if (value != null) {
			return value;
		}

		throw ErrorTypes.invalidKey.createWithContext(reader, this.name);
	}

	static world(server: Server){
		return new KeyedArgumentType<World>("world", x => server.getWorld(x))
	}

	static onlinePlayer(server: Server) {
		return new KeyedArgumentType<Player>("player", (x) => server.getPlayerByName(x))
	}

	static playerHolder(server: Server) {
		return new KeyedArgumentType<VirtualPlayerHolder>("player", (x) => server.getPlayerHolderByName(x))
	}

	static group(server: Server, create = false) {
		return new KeyedArgumentType<Group>("group", (x) => {
			let group = server.groups.get(x);

			if (!group && create) {
				group = new Group({ name: x, permissions: {} });
				server.groups.set(x, group);
			}

			return group ?? null;
		})
	}
}

export class XYZFloatArgumentType extends ArgumentType<XYZ> {
	parse(reader: StringReader): XYZ {
		const x = reader.readFloat();
		reader.skip()
		const y = reader.readFloat();
		reader.skip()
		const z = reader.readFloat();
		return [ x, y, z ];
	}
}

export class BlockPosArgumentType extends ArgumentType<XYZ> {
	parse(reader: StringReader): XYZ {
		const x = reader.readInt();
		reader.skip()
		const y = reader.readInt();
		reader.skip()
		const z = reader.readInt();
		return [ x, y, z ];
		}
}

export class TriStateArgumentType extends ArgumentType<TriState> {
	parse(reader: StringReader): TriState {
		const value = reader.readString();

		switch (value.toLowerCase()) {
			case 'yes':
			case 'enabled':
			case 'enable':
			case 'true':
				return TriState.TRUE;
			case 'no':
			case 'disabled':
			case 'disable':
			case 'false':
				return TriState.FALSE;
			case 'reset':
			case 'default':
				return TriState.DEFAULT;

			default:
				throw ErrorTypes.invalidTriState.createWithContext(reader);
		}
	}
}
