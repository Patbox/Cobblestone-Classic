import { 
    CommandNode,
    StringReader,
    Command,
    StringRange,
    CommandContext,
    CommandContextBuilder,
    Predicate,
    RedirectModifier,
    CommandSyntaxError,
    Suggestions,
    SuggestionsBuilder
} from '../index.ts';

export class LiteralCommandNode<S> extends CommandNode<S> {
    private literal: string;
    
    constructor(literal: string, command: Command<S>, requirement: Predicate<S>, redirect: CommandNode<S>, modifier: RedirectModifier<S>, forks: boolean) {
        super(command, requirement, redirect, modifier, forks);
        this.literal = literal;
    }

    parse(reader: StringReader, contextBuilder: CommandContextBuilder<S>): void {
        const start = reader.getCursor();
        const end = this.parseInternal(reader);
        if (end > -1) {
            contextBuilder.withNode(this, new StringRange(start, end));
            return;
        }
        throw CommandSyntaxError.LITERAL_INCORRECT.createWithContext(reader, this.literal);
    }

    private parseInternal(reader: StringReader): number {
        const start = reader.getCursor();
        if (reader.canRead(this.literal.length)) {
            const end = start + this.literal.length;
            if (reader.getString().substr(start, this.literal.length) === this.literal) {
                reader.setCursor(end);
                if (!reader.canRead() || reader.peek() == " ") {
                    return end;
                } else {
                    reader.setCursor(start);
                }
            }
        }
        return -1;
    }
    
    getName(): string {
        return this.literal;
    }

    getUsageText(): string {
        return this.literal;
    }

    listSuggestions(context: CommandContext<S>, builder: SuggestionsBuilder): Promise<Suggestions> {
        if (this.literal.toLowerCase().startsWith(builder.getRemaining().toLowerCase())) {
            return builder.suggest(this.literal).buildPromise();
        } else {
            return Suggestions.empty();
        }
    }
}
