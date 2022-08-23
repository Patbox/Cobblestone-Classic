import {
    ArgumentType,
    StringReader,
    CommandContext,
    SuggestionsBuilder,
    Suggestions
} from "../index.ts";

export class BoolArgumentType extends ArgumentType<boolean> {

    parse(reader: StringReader): boolean {
        return reader.readBoolean();
    }

    // deno-lint-ignore no-explicit-any
    listSuggestions(_context: CommandContext<any>, builder: SuggestionsBuilder): Promise<Suggestions> {
        if ("true".startsWith(builder.getRemaining().toLowerCase())) {
            builder.suggest("true");
        }
        if ("false".startsWith(builder.getRemaining().toLowerCase())) {
            builder.suggest("false");
        }
        return builder.buildPromise();
    }
}

export function bool(): BoolArgumentType {
    return new BoolArgumentType();
}
