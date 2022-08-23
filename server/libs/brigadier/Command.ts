import { CommandContext } from "./index.ts";

export type Command<S> = (c: CommandContext<S>, source: S) => number | void;
