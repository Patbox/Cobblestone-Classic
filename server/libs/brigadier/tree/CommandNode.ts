import {
    StringReader,
    Command,
    LiteralCommandNode,
    ArgumentCommandNode,
    CommandContext,
    CommandContextBuilder,
    Predicate,
    RedirectModifier,
    SuggestionsBuilder,
    Suggestions
} from '../index.ts';

export abstract class CommandNode<S> {
    private children: Map<string, CommandNode<S>>;
    private literals: Map<string, LiteralCommandNode<S>>;
    private arguments: Map<string, ArgumentCommandNode<S, any>>;
    private command: Command<S>;
    private requirement: Predicate<S>;
    private redirect: CommandNode<S>;
    private modifier: RedirectModifier<S>;
    private forks: boolean;

    constructor(command: Command<S>, requirement: Predicate<S>, redirect: CommandNode<S>, modifier: RedirectModifier<S>, forks: boolean) {
        this.children = new Map();
        this.literals = new Map();
        this.arguments = new Map();
        this.command = command;
        this.requirement = requirement;
        this.redirect = redirect;
        this.modifier = modifier;
        this.forks = forks;
    }

    getCommand(): Command<S> {
        return this.command;
    }

    getChildren(): CommandNode<S>[] {
        return Array.from(this.children.values());
    }

    getChild(name: string): CommandNode<S> {
        return <CommandNode<S>> (this.children?.get(name));
    }

    getRedirect(): CommandNode<S> {
        return this.redirect;
    }

    getRedirectModifier(): RedirectModifier<S> {
        return this.modifier;
    }

    isFork(): boolean {
        return this.forks;
    }

    canUse(source: S) {
        return this.requirement(source);
    }

    addChild(node: CommandNode<S>): void {
        const child = this.children.get(node.getName());
        if (child != null) {
            if (node.getCommand() != null) {
                child.command = node.getCommand();
            }
            node.getChildren().forEach((grandChild) => {
                child.addChild(grandChild);
            });
        } else {
            this.children.set(node.getName(), node);
            if (node instanceof LiteralCommandNode) {
                this.literals.set(node.getName(), node);
            } else if (node instanceof ArgumentCommandNode) {
                this.arguments.set(node.getName(), node);
            }
        }
    }

    abstract parse(reader: StringReader, context: CommandContextBuilder<S>): void;

    abstract getName(): string;

    abstract getUsageText(): string;

    abstract listSuggestions(context: CommandContext<S>, builder: SuggestionsBuilder): Promise<Suggestions>;

    getRelevantNodes(input: StringReader): CommandNode<S>[] {
        if (this.literals.size > 0) {
            const cursor = input.getCursor();
            while (input.canRead() && input.peek() != " ") {
                input.skip();
            }
            const text = input.getString().substring(cursor, input.getCursor());
            input.setCursor(cursor);
            const literal = this.literals.get(text);
            if (literal != null) {
                return [literal];
            }
        }
        return Array.from(this.arguments.values());
    }
}
