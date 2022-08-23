import {
    StringReader,
    CommandContext,
    Suggestions,
    SuggestionsBuilder
} from "../index.ts";

export abstract class ArgumentType<T> {
    abstract parse(reader: StringReader): T;

    listSuggestions(context: CommandContext<any>, builder: SuggestionsBuilder): Promise<Suggestions> {
        return Suggestions.empty();
    }
}
