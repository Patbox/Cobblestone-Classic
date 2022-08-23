import { 
    CommandNode,
    StringReader,
    CommandContextBuilder,
    CommandContext,
    Suggestions,
    SuggestionsBuilder,
	Command
} from '../index.ts';

export class RootCommandNode<S> extends CommandNode<S> {

    constructor() {
        super(<Command<S>> <unknown> null, c => true, <CommandNode<S>> <unknown> null, c => <S> <unknown> null, false);
    }

    parse(reader: StringReader, contextBuilder: CommandContextBuilder<S>): void {
    }

    getName(): string {
        return "";
    }

    getUsageText(): string {
        return "";
    }

    listSuggestions(context: CommandContext<S>, builder: SuggestionsBuilder): Promise<Suggestions> {
        return Suggestions.empty();
    }
}
