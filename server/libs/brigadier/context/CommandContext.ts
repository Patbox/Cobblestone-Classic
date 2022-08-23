import { Command,
    CommandNode,
    StringRange,
    ParsedArgument,
    ParsedCommandNode,
    RedirectModifier
} from '../index.ts';

export class CommandContext<S> {
    private source: S;
    private input: string;
    private arguments: Map<string, ParsedArgument<any>>; 
    private nodes: ParsedCommandNode<S>[];
    private command: Command<S>;
    private rootNode: CommandNode<S>;
    private child: CommandContext<S>;
    private range: StringRange;
    private modifier: RedirectModifier<S>;
    private forks: boolean;

    constructor(source: S, input: string, parsedArguments: Map<string, ParsedArgument<any>>, command: Command<S>, rootNode: CommandNode<S>, nodes: ParsedCommandNode<S>[], range: StringRange, child: CommandContext<S>, modifier: RedirectModifier<S>, forks: boolean) {
        this.source = source;
        this.input = input;
        this.arguments = parsedArguments;
        this.command = command;
        this.rootNode = rootNode;
        this.nodes = nodes;
        this.range = range;
        this.child = child;
        this.modifier = modifier;
        this.forks = forks;
    }

    copyFor(source: S): CommandContext<S> {
        if (this.source === source) {
            return this;
        }
        return new CommandContext<S>(source, this.input, this.arguments, this.command, this.rootNode, this.nodes, this.range, this.child, this.modifier, this.forks);
    }

    getChild(): CommandContext<S> {
        return this.child;
    }

    getLastChild(): CommandContext<S> {
        let result: CommandContext<S> = this;
        while (result.getChild() != null) {
            result = result.getChild();
        }
        return result;
    }

    getCommand(): Command<S> {
        return this.command;
    }

    getSource(): S {
        return this.source;
    }

    getRootNode(): CommandNode<S> {
        return this.rootNode;
    }

    get(name: string): any {
        const argument = this.arguments.get(name);
        // TODO: Throw exception when argument is null
        return argument?.getResult();
    }

	getTyped<T>(name: string): T {
        const argument = this.arguments.get(name);
        // TODO: Throw exception when argument is null
        return argument?.getResult();
    }

    getRedirectModifier(): RedirectModifier<S> {
        return this.modifier;
    }

    getRange(): StringRange {
        return this.range;
    }

    getInput(): string {
        return this.input;
    }

    getNodes(): ParsedCommandNode<S>[] {
        return this.nodes;
    }

    hasNodes(): boolean {
        return this.nodes.length !== 0;
    }

    isForked(): boolean {
        return this.forks;
    }
}
