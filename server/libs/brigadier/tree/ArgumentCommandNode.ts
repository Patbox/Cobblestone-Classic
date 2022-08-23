import {
    ArgumentType,
    CommandNode,
    StringReader,
    Command,
    CommandContext,
    CommandContextBuilder,
    Predicate,
    RedirectModifier,
    ParsedArgument,
    Suggestions,
    SuggestionsBuilder
} from '../index.ts';

export class ArgumentCommandNode<S, T> extends CommandNode<S> {
    name: string;
    type: ArgumentType<T>;

    constructor(name: string, type: ArgumentType<T>, command: Command<S>, requirement: Predicate<S>, redirect: CommandNode<S>, modifier: RedirectModifier<S>, forks: boolean) {
        super(command, requirement, redirect, modifier, forks);
        this.name = name;
        this.type = type;
    }

    getType(): ArgumentType<T> {
        return this.type;
    }

    parse(reader: StringReader, contextBuilder: CommandContextBuilder<S>): void {
        const start = reader.getCursor();
        const result = this.type.parse(reader);
        const parsed = new ParsedArgument<T>(start, reader.getCursor(), result);
        contextBuilder.withArgument(this.name, parsed);
        contextBuilder.withNode(this, parsed.getRange());
    }
    
    getName(): string {
        return this.name;
    }

    getUsageText(): string {
        return "<" + this.name + ">";
    }
    
    listSuggestions(context: CommandContext<S>, builder: SuggestionsBuilder): Promise<Suggestions> {
        return Suggestions.empty();
    }
}
