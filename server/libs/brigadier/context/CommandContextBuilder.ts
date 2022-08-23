import {
    CommandNode,
    CommandDispatcher,
    Command,
    CommandContext,
    StringRange,
    ParsedCommandNode,
    ParsedArgument,
    RedirectModifier,
    SuggestionContext
} from '../index.ts';

export class CommandContextBuilder<S> {
    private source: S;
    private arguments: Map<string, ParsedArgument<any>>;
    private rootNode: CommandNode<S>;
    private dispatcher: CommandDispatcher<S>;
    private command?: Command<S>;
    private child?: CommandContextBuilder<S>;
    private range: StringRange;
    private nodes: ParsedCommandNode<S>[];
    private modifier?: RedirectModifier<S>;
    private forks?: boolean;

    constructor(dispatcher: CommandDispatcher<S>, source: S, rootNode: CommandNode<S>, start: number) {
        this.dispatcher = dispatcher;
        this.source = source;
        this.rootNode = rootNode;
        this.range = StringRange.at(start);
        this.nodes = [];
        this.arguments = new Map();
    }

    withSource(source: S): CommandContextBuilder<S> {
        this.source = source;
        return this;
    }

    getSource(): S {
        return this.source;
    }

    getRootNode(): CommandNode<S> {
        return this.rootNode;
    }

    withArgument(name: string, argument: ParsedArgument<any>): CommandContextBuilder<S> {
        this.arguments.set(name, argument);
        return this;
    }

    getArguments(): Map<string, ParsedArgument<any>> {
        return this.arguments;
    }

    withChild(child: CommandContextBuilder<S>): CommandContextBuilder<S> {
        this.child = child;
        return this;
    }

    getChild(): CommandContextBuilder<S> {
        return <CommandContextBuilder<S>> this.child;
    }

    getLastChild(): CommandContextBuilder<S> {
        let result: CommandContextBuilder<S> = this;
        while (result.getChild() != null) {
            result = result.getChild();
        }
        return result;
    }

    withCommand(command: Command<S>): CommandContextBuilder<S> {
        this.command = command;
        return this;
    }

    getCommand(): Command<S> {
        return <Command<S>> this.command;
    }

    withNode(node: CommandNode<S>, range: StringRange): CommandContextBuilder<S> {
        this.nodes.push(new ParsedCommandNode<S>(node, range));
        this.range = StringRange.encompassing(this.range, range);
        this.modifier = node.getRedirectModifier();
        this.forks = node.isFork();
        return this;
    }

    getNodes(): ParsedCommandNode<S>[] {
        return this.nodes;
    }

    copy(): CommandContextBuilder<S> {
        const copy = new CommandContextBuilder<S>(this.dispatcher, this.source, this.rootNode, this.range.getStart());
        copy.command = this.command;
        copy.child = this.child;
        copy.range = this.range;
        copy.nodes.push(...this.nodes);
        this.arguments.forEach((v, k) => {
            copy.arguments.set(k, v);
        });
        return copy;

    }

    build(input: string): CommandContext<S> {
        const child = this.child == null ? null : this.child.build(input);
        return new CommandContext(this.source, input, this.arguments, <Command<S>> this.command, this.rootNode, this.nodes, this.range, <CommandContext<S>> child, <RedirectModifier<S>> this.modifier, this.forks || false);
    }

    getDispatcher(): CommandDispatcher<S> {
        return this.dispatcher;
    }

    getRange(): StringRange {
        return this.range;
    }

    findSuggestionContext(cursor: number): SuggestionContext<S> {
        if (this.range.getStart() <= cursor) {
            if (this.range.getEnd() < cursor) {
                if (this.child != null) {
                    return this.child.findSuggestionContext(cursor);
                } else if (this.nodes.length > 0) {
                    const last = this.nodes[this.nodes.length - 1];
                    return new SuggestionContext(last.getNode(), last.getRange().getEnd() + 1);
                } else {
                    return new SuggestionContext(this.rootNode, this.range.getStart());
                }
            } else {
                let prev = this.rootNode;
                for (const node of this.nodes) {
                    const nodeRange = node.getRange();
                    if (nodeRange.getStart() <= cursor && cursor <= nodeRange.getEnd()) {
                        return new SuggestionContext(prev, nodeRange.getStart());
                    }
                    prev = node.getNode();
                }
                if (prev === null) {
                    throw new Error("Can't find node before cursor");
                }
                return new SuggestionContext(prev, this.range.getStart());
            }
        }
        throw new Error("Can't find node before cursor");
    }
}
