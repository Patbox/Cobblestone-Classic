import {
    RootCommandNode,
    LiteralCommandNode,
    StringReader,
    LiteralArgumentBuilder,
    CommandContextBuilder,
    CommandNode,
    ParseResults,
    CommandSyntaxError,
    Suggestions,
    SuggestionsBuilder
} from "./index.ts";

export class CommandDispatcher<S> {

    private root: RootCommandNode<S>;

    private static USAGE_OPTIONAL_OPEN = "[";
    private static USAGE_OPTIONAL_CLOSE = "]";
    private static USAGE_REQUIRED_OPEN = "(";
    private static USAGE_REQUIRED_CLOSE = ")";
    private static USAGE_OR = "|";

    constructor() {
        this.root = new RootCommandNode();
    }

    register(command: LiteralArgumentBuilder<S>): LiteralCommandNode<S> {
        const build = command.build();
        this.root.addChild(build);
        return build;
    }

    execute(parse: ParseResults<S> | string, source: S): number {
        if (typeof(parse) === "string") {
            parse = this.parse(new StringReader(parse), source);
        }

        if (parse.getReader().canRead()) {
            if (parse.getErrors().size == 1) {
                throw parse.getErrors().values().next();
            } else if (parse.getContext().getRange().isEmpty()) {
                throw CommandSyntaxError.DISPATCHER_UNKNOWN_COMMAND.createWithContext(parse.getReader());
            } else {
                throw CommandSyntaxError.DISPATCHER_UNKNOWN_ARGUMENT.createWithContext(parse.getReader());
            }
        }

        let result = 0;
        let successfulForks = 0;
        let forked = false;
        let foundCommand = false;
        const command = parse.getReader().getString();
        const original = parse.getContext().build(command);
        let contexts = [original];
        let next = [];

        while (contexts.length > 0) {
            const size = contexts.length;
            for (let i = 0; i < size; i++) {
                const context = contexts[i];
                const child = context.getChild();
                if (child !== null) {
                    forked = forked || context.isForked();
                    if (child.hasNodes()) {
                        foundCommand = true;
                        const modifier = context.getRedirectModifier();
                        if (modifier === null) {
                            next.push(child.copyFor(context.getSource()));
                        } else {
                            try {
                                const results = (<S[]> modifier(context));
                                results.forEach(source => {
                                    next.push(child.copyFor(source));
                                })
                            } catch (e) {
                                if (!forked) throw e;
                            }
                        }
                    }
                } else if (context.getCommand()) {
                    foundCommand = true;
                    try {
                        const value = context.getCommand()(context, context.getSource());
                        result += (value || value === 0) ? value : 1;
                        successfulForks++;
                    } catch (e) {
                        if (!forked) throw e;
                    }
                }
            }
            contexts = next;
            next = [];
        }

        if (!foundCommand) {
            throw CommandSyntaxError.DISPATCHER_UNKNOWN_COMMAND.createWithContext(parse.getReader());
        }
        return forked ? successfulForks : result;
    }

    parse(reader: StringReader | string, source: S): ParseResults<S> {
        reader = new StringReader(reader);
        const context = new CommandContextBuilder<S>(this, source, this.root, reader.getCursor());
        return this.parseNodes(this.root, reader, context);
    }

    private parseNodes(node: CommandNode<S>, originalReader: StringReader, contextSoFar: CommandContextBuilder<S>): ParseResults<S> {
        const source = contextSoFar.getSource();
        const errors = new Map<CommandNode<S>, CommandSyntaxError>();
        const potentials = [];
        const cursor = originalReader.getCursor();

        for (const child of node.getRelevantNodes(originalReader)) {
            if (!child.canUse(source)) {
                continue;
            }
            const context = contextSoFar.copy();
            const reader = new StringReader(originalReader);

            try {
                try {
                    child.parse(reader, context);
                } catch (e) {
                    if (e instanceof CommandSyntaxError) {
                        throw e;
                    } else {
                        throw CommandSyntaxError.DISPATCHER_PARSE_ERROR.createWithContext(reader, e.message);
                    }
                }
                if (reader.canRead() && reader.peek() !== " ") {
                    throw CommandSyntaxError.DISPATCHER_EXPECTED_ARGUMENT_SEPARATOR.createWithContext(reader);
                }
            } catch (e) {
                if (e instanceof CommandSyntaxError) {
                    errors.set(child, e);
                    reader.setCursor(cursor);
                    continue;
                } else {
                    throw e;
                }
            }

            context.withCommand(child.getCommand());
            if (reader.canRead(child.getRedirect() === null ? 2 : 1)) {
                reader.skip();
                if (child.getRedirect()) {
                    const childContext = new CommandContextBuilder<S>(this, source, child.getRedirect(), reader.getCursor());
                    const parse = this.parseNodes(child.getRedirect(), reader, childContext);
                    context.withChild(parse.getContext());
                    return new ParseResults<S>(context, parse.getReader(), parse.getErrors());
                } else {
                    potentials.push(this.parseNodes(child, reader, context));
                }
            } else {
                potentials.push(new ParseResults(context, reader, new Map()));
            }
        }
        if (potentials.length == 0) {
            potentials.push(new ParseResults(contextSoFar, originalReader, errors));
        }
        return potentials[0];
    }

    getAllUsage(node: CommandNode<S>, source: S, restricted: boolean): string[] {
        const result: string[] = [];
        this.getAllUsageImpl(node, source, result, "", restricted);
        return result;
    }

    private getAllUsageImpl(node: CommandNode<S>, source: S, result: string[], prefix: string, restricted: boolean): void {
        if (restricted && !node.canUse(source)) {
            return;
        }

        if (node.getCommand() != null) {
            result.push(prefix);
        }

        if (node.getRedirect() != null) {
            const redirect = node.getRedirect() === this.root ? "..." : "-> " + node.getRedirect().getUsageText();
            result.push(prefix.length === 0 ? node.getUsageText() + " " + redirect : prefix + " " + redirect);
        } else if (node.getChildren().length > 0) {
            for (const child of node.getChildren()) {
                const newPrefix = prefix.length === 0 ? child.getUsageText() : prefix + " " + child.getUsageText();
                this.getAllUsageImpl(child, source, result, newPrefix, restricted);
            }
        }
    }

    async getCompletionSuggestions(parse: ParseResults<S>, cursor?: number): Promise<Suggestions> {
        if (cursor === undefined) {
            cursor = parse.getReader().getTotalLength();
        }
        const context = parse.getContext();
        const nodeBeforeCursor = context.findSuggestionContext(cursor);
        const parent = nodeBeforeCursor.parent;
        const start = Math.min(nodeBeforeCursor.startPos, cursor);

        const fullInput = parse.getReader().getString();
        const truncatedInput = fullInput.substring(0, cursor);
        let promises: Promise<Suggestions>[] = [];
        for (const node of parent.getChildren()) {
            let promise = Suggestions.empty();
            try {
                promise = node.listSuggestions(context.build(truncatedInput), new SuggestionsBuilder(truncatedInput, start));
            } catch(ignored) {
                console.log("???", ignored)
            }
            promises.push(promise);
        }
        const suggestions = await Promise.all(promises);
        return Suggestions.merge(fullInput, suggestions);
    }

    getSmartUsage(node: CommandNode<S>, source: S): Map<CommandNode<S>, string>;
    getSmartUsage(node: CommandNode<S>, source: S, optional: boolean, deep: boolean): string;

    getSmartUsage(node: CommandNode<S>, source: S, optional?: boolean, deep?: boolean): Map<CommandNode<S>, string> | string | undefined {
        if (optional === undefined && deep === undefined) {
            const result = new Map<CommandNode<S>, string>();
            const optional: boolean = node.getCommand() !== undefined && node.getCommand() !== null;
            const children = node.getChildren();

            for (const index in children) {
                const child = children[index];
                const usage = this.getSmartUsage(child, source, optional, false);

                if (usage !== undefined) {
                    result.set(child, usage);
                }
            }

            return result;
        } else {

            if (!node.canUse(source)) {
                return undefined
            }

            const self: string = optional ? CommandDispatcher.USAGE_OPTIONAL_OPEN + node.getUsageText() + CommandDispatcher.USAGE_OPTIONAL_CLOSE : node.getUsageText();
            const childOptional: boolean = node.getCommand() !== undefined;
            const open: string = childOptional ? CommandDispatcher.USAGE_OPTIONAL_OPEN : CommandDispatcher.USAGE_REQUIRED_OPEN
            const close: string = childOptional ? CommandDispatcher.USAGE_OPTIONAL_CLOSE : CommandDispatcher.USAGE_REQUIRED_CLOSE

            if (!deep) {
                if (node.getRedirect() !== undefined) {
                    const redirect: string = node.getRedirect() === this.root ? "..." : "-> " + node.getRedirect().getUsageText();
                    return self + " " + redirect;
                } else {
                    const children: CommandNode<S>[] = node.getChildren().filter(c => c.canUse(source))

                    if (children.length === 1) {
                        const usage = String(this.getSmartUsage(children[0], source, childOptional, childOptional));
                        
                        if (usage !== undefined) {
                            return self + " " + usage;
                        }
                    } else if (children.length > 1) {
                        let childUsage = new Set<string>();

                        for (const index in children) {
                            const child = children[index];
                            const usage = this.getSmartUsage(child, source, childOptional, true);

                            if (usage !== undefined) {
                                childUsage.add(usage)
                            }
                        }

                        if (childUsage.size === 1) {
                            const usage = childUsage.values().next().value
                            return self + " " + (childOptional ? CommandDispatcher.USAGE_OPTIONAL_OPEN + usage + CommandDispatcher.USAGE_OPTIONAL_CLOSE: usage);
                        } else if (childUsage.size > 1) {
                            let builder = open

                            for (let index = 0; index < children.length; index++) {
                                const child = children[index]

                                if (index > 0) {
                                    builder += CommandDispatcher.USAGE_OR
                                }
                                builder += child.getUsageText()
                            }

                            if (children.length > 0) {
                                builder += close
                                return self + " " + builder;
                            }
                        }
                    }
                }
            }
        }
    }

    getRoot(): RootCommandNode<S> {
        return this.root;
    }
}
